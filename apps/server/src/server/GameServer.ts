import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  type ActionMessage,
  type AimMessage,
  type HelloMessage,
  type LobbyActionMessage,
  type LobbyStateMessage,
  type MoveIntentMessage,
  parseClientToServerMessage,
  type PingMessage,
  type ServerToClientMessage,
} from "@shared/net/protocol.ts";
import { ChatService } from "@server/chat/ChatService.ts";
import { Player } from "@server/entities/Player.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { ScopedWsServer } from "@server/net/ScopedWsServer.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  applyPlayerStarterLoadout,
  validatePlayerStarterLoadout,
} from "@server/server/starterLoadout.ts";
import { TickClock } from "@server/server/TickClock.ts";
import type { AuthService } from "@server/services/AuthService.ts";
import { loadMap } from "@server/systems/MapLoader.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { World } from "@server/world/World.ts";

type MatchLobby = {
  code: string;
  playerClientIds: Set<string>;
  createdAtMs: number;
  countdownEndsAtMs: number | null;
  startedAtMs: number | null;
  scopedNetwork: ScopedWsServer;
  gameServer: GameServer;
};

const MATCH_LOBBY_MAX_PLAYERS = 5;
const MATCH_LOBBY_START_COUNTDOWN_MS = 10_000;
const MATCH_LOBBY_CODE_LENGTH = 6;

/**
 * Authoritative server runtime for players, input handling, and snapshot output.
 * This class coordinates the world, networking layer, and tick loop.
 */
export class GameServer {
  public world: World;
  public networkServer: NetworkServerLike;
  public snapshotManager: SnapshotManager;
  public antiCheatValidator: AntiCheatValidator;
  public chatService: ChatService;

  private readonly gameConfig: GameConfig;
  private readonly clock: TickClock;
  private readonly authService: AuthService;
  private readonly playerIdByClientId = new Map<string, number>();
  private readonly clientStateById = new Map<
    string,
    "connected" | "hello_pending" | "ready"
  >();
  private readonly lastInputSequenceByClientId = new Map<string, number>();
  private readonly enableMatchmaking: boolean;
  private readonly matchLobbyByCode = new Map<string, MatchLobby>();
  private readonly matchLobbyCodeByClientId = new Map<string, string>();
  private readonly lastSentLobbyStateByClientId = new Map<string, string>();
  private readonly activeServerByClientId = new Map<string, GameServer>();

  constructor(
    gameConfig: GameConfig,
    networkServer: NetworkServerLike,
    authService: AuthService,
    options: { enableMatchmaking?: boolean } = {},
  ) {
    bootstrapTypeRegistries();
    validatePlayerStarterLoadout();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.authService = authService;
    this.enableMatchmaking = options.enableMatchmaking ?? true;
    this.world = new World(gameConfig);
    this.snapshotManager = new SnapshotManager();
    this.antiCheatValidator = new AntiCheatValidator();
    this.chatService = new ChatService({
      networkServer: this.networkServer,
      world: this.world,
      playerIdByClientId: this.playerIdByClientId,
    });

    // Initialize wave spawning system
    this.initializeWaveSpawning();

    // Spawn static map structures and initial enemies
    loadMap(this.world);

    this.clock = new TickClock(gameConfig.tickRate);

    this.networkServer.onOpen((clientId) => {
      this.clientStateById.set(clientId, "connected");
    });

    this.networkServer.onClose((clientId) => {
      this.onDisconnect(clientId);
    });

    this.networkServer.onMessage((clientId, rawMessage) => {
      this.handleRawMessage(clientId, rawMessage);
    });
  }

  /**
   * Initializes the wave spawning system.
   */
  private initializeWaveSpawning(): void {
    this.world.waveSystem = WaveSystem.loadFromFile({
      dayNightSystem: this.world.dayNightSystem,
      configPath: "./apps/server/src/config/waves.json",
      chatService: this.chatService,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("Wave spawning system initialized");
    }
  }

  public start(): void {
    this.clock.start(() => this.tick());
  }

  public stop(): void {
    this.clock.stop();
    if (this.enableMatchmaking) {
      for (const lobby of this.matchLobbyByCode.values()) {
        lobby.gameServer.stop();
      }
      this.matchLobbyByCode.clear();
      this.matchLobbyCodeByClientId.clear();
      this.lastSentLobbyStateByClientId.clear();
      this.activeServerByClientId.clear();
    }
  }

  public tick(): void {
    this.world.step();
    if (this.enableMatchmaking) {
      this.updateMatchLobbies(Date.now());
    }
    const drainedEvents = this.world.events.toArray();
    this.world.events.clear();
    this.snapshotManager.prepareTick(this.world, drainedEvents);

    for (const [clientId, state] of this.clientStateById) {
      if (state !== "ready") {
        continue;
      }
      const playerId = this.playerIdByClientId.get(clientId);
      if (!playerId) {
        continue;
      }
      const snapshot = this.snapshotManager.makeSnapshotForPlayer(
        this.world,
        playerId,
        this.gameConfig.replication.interestRadius,
      );
      const snapshotMessage: ServerToClientMessage = {
        t: "snapshot",
        snapshot,
      };
      this.networkServer.send(clientId, JSON.stringify(snapshotMessage));
    }
  }

  public handleMoveIntent(
    clientId: string,
    moveIntent: MoveIntentMessage,
  ): void {
    const player = this.getReadyPlayer(clientId);
    if (!player) {
      return;
    }

    const lastInputSequence =
      this.lastInputSequenceByClientId.get(clientId) ?? -1;
    if (moveIntent.seq <= lastInputSequence) {
      this.rejectInput(clientId, player, "stale_input", moveIntent);
      return;
    }

    if (!this.antiCheatValidator.validateMoveIntent(moveIntent, player)) {
      this.rejectInput(clientId, player, "invalid_input", moveIntent);
      return;
    }

    player.setMoveIntent(moveIntent.key, moveIntent.pressed);
    this.lastInputSequenceByClientId.set(clientId, moveIntent.seq);

    if (this.world.focusedTrace.matchesEntity(player)) {
      this.world.focusedTrace.recordEntityEvent(
        this.world,
        "move_intent_applied",
        player,
        {
          clientId,
          key: moveIntent.key,
          pressed: moveIntent.pressed,
          seq: moveIntent.seq,
        },
      );
    }
  }

  public handleAim(clientId: string, aimMessage: AimMessage): void {
    const player = this.getReadyPlayer(clientId);
    if (!player) {
      return;
    }

    const lastInputSequence =
      this.lastInputSequenceByClientId.get(clientId) ?? -1;
    if (aimMessage.seq <= lastInputSequence) {
      this.rejectInput(clientId, player, "stale_input", aimMessage);
      return;
    }

    if (!this.antiCheatValidator.validateAim(aimMessage, player)) {
      this.rejectInput(clientId, player, "invalid_input", aimMessage);
      return;
    }

    player.setAimTheta(aimMessage.theta);
    this.lastInputSequenceByClientId.set(clientId, aimMessage.seq);

    if (this.world.focusedTrace.matchesEntity(player)) {
      this.world.focusedTrace.recordEntityEvent(
        this.world,
        "aim_applied",
        player,
        {
          clientId,
          theta: aimMessage.theta,
          seq: aimMessage.seq,
        },
      );
    }
  }

  public handleAction(clientId: string, actionMessage: ActionMessage): void {
    const player = this.getReadyPlayer(clientId);
    if (!player) {
      return;
    }

    const lastInputSequence =
      this.lastInputSequenceByClientId.get(clientId) ?? -1;
    if (actionMessage.seq <= lastInputSequence) {
      this.rejectInput(clientId, player, "stale_input", actionMessage);
      return;
    }

    if (
      !this.antiCheatValidator.validateAction(actionMessage, player, this.world)
    ) {
      this.rejectInput(clientId, player, "invalid_input", actionMessage);
      return;
    }

    player.enqueueAction(actionMessage);
    this.lastInputSequenceByClientId.set(clientId, actionMessage.seq);

    if (this.world.focusedTrace.matchesEntity(player)) {
      this.world.focusedTrace.recordEntityEvent(
        this.world,
        "action_enqueued",
        player,
        {
          clientId,
          normalizedInput: structuredClone(actionMessage),
          queueLength: player.getQueuedActionCount(),
        },
      );
    }
  }

  public handleRespawn(clientId: string): void {
    const player = this.getReadyPlayer(clientId);
    if (!player || player.alive) {
      return;
    }
    player.respawn(this.world);
  }

  public onConnect(clientId: string, requestedPlayerName?: string): number {
    const existingPlayerId = this.playerIdByClientId.get(clientId);
    if (existingPlayerId) {
      return existingPlayerId;
    }

    const playerId = this.world.allocEntityId();
    const fallbackPlayerName = `player-${playerId}`;
    const playerEntity = new Player(
      playerId,
      this.sanitizePlayerName(requestedPlayerName, fallbackPlayerName),
    );

    playerEntity.x = this.gameConfig.worldSize.w / 2;
    playerEntity.y = this.gameConfig.worldSize.h / 2;
    applyPlayerStarterLoadout(playerEntity);

    this.world.spawn(playerEntity);
    this.playerIdByClientId.set(clientId, playerId);
    this.lastInputSequenceByClientId.set(clientId, -1);
    if (this.enableMatchmaking) {
      this.activeServerByClientId.set(clientId, this);
    }

    return playerId;
  }

  public onDisconnect(clientId: string): void {
    if (this.enableMatchmaking) {
      const activeServer = this.activeServerByClientId.get(clientId);
      if (activeServer && activeServer !== this) {
        this.removeClientFromMatchLobby(clientId, {
          sendDepartureMessage: true,
          migrateToPlayground: false,
        });
        activeServer.detachClient(clientId);
        this.activeServerByClientId.delete(clientId);
      } else {
        this.removeClientFromMatchLobby(clientId, {
          sendDepartureMessage: true,
          migrateToPlayground: false,
        });
      }
      this.lastSentLobbyStateByClientId.delete(clientId);
    }
    this.clientStateById.delete(clientId);
    this.lastInputSequenceByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
  }

  private handleRawMessage(clientId: string, rawMessage: string): void {
    if (this.enableMatchmaking) {
      const activeServer = this.activeServerByClientId.get(clientId);
      if (activeServer && activeServer !== this) {
        activeServer.handleRawMessage(clientId, rawMessage);
        return;
      }
    }

    const clientMessage = parseClientToServerMessage(rawMessage);
    if (!clientMessage) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "invalid_message" }),
      );
      return;
    }

    switch (clientMessage.t) {
      case "hello":
        void this.handleHello(clientId, clientMessage);
        return;
      case "move":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.handleMoveIntent(clientId, clientMessage);
        return;
      case "aim":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.handleAim(clientId, clientMessage);
        return;
      case "action":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.handleAction(clientId, clientMessage);
        return;
      case "respawn":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.handleRespawn(clientId);
        return;
      case "chat":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.chatService.handleChat(clientId, clientMessage.text);
        return;
      case "lobby":
        if (!this.requireReady(clientId)) {
          return;
        }
        if (!this.enableMatchmaking) {
          return;
        }
        this.handleLobbyAction(clientId, clientMessage);
        return;
      case "ping": {
        const pingMessage = clientMessage as PingMessage;
        const pongMessage: ServerToClientMessage = {
          t: "pong",
          timeMs: pingMessage.timeMs,
        };
        this.networkServer.send(clientId, JSON.stringify(pongMessage));
        return;
      }
      default:
        this.networkServer.send(
          clientId,
          JSON.stringify({ t: "error", message: "unknown_message_type" }),
        );
    }
  }

  private async handleHello(
    clientId: string,
    helloMessage: HelloMessage,
  ): Promise<void> {
    const clientState = this.clientStateById.get(clientId) ?? "connected";
    if (clientState === "ready" || clientState === "hello_pending") {
      return;
    }

    if (helloMessage.compatHash !== this.gameConfig.compatHash) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "compat_mismatch" }),
      );
      this.networkServer.disconnect(clientId, "compat_mismatch");
      return;
    }

    if (helloMessage.googleIdToken) {
      if (!this.authService.isConfigured()) {
        this.networkServer.send(
          clientId,
          JSON.stringify({ t: "error", message: "auth_not_configured" }),
        );
        this.networkServer.disconnect(clientId, "auth_not_configured");
        return;
      }

      this.clientStateById.set(clientId, "hello_pending");
      const authenticatedUser = await this.authService.verifyGoogleIdToken(
        helloMessage.googleIdToken,
      );
      if (this.clientStateById.get(clientId) !== "hello_pending") {
        return;
      }
      this.clientStateById.set(clientId, "connected");
      if (!authenticatedUser) {
        this.networkServer.send(
          clientId,
          JSON.stringify({ t: "error", message: "auth_invalid" }),
        );
        this.networkServer.disconnect(clientId, "auth_invalid");
        return;
      }
    }

    if (this.playerIdByClientId.size >= this.gameConfig.network.maxPlayers) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "server_full" }),
      );
      this.networkServer.disconnect(clientId, "server_full");
      return;
    }

    const playerId = this.onConnect(clientId, helloMessage.playerName);
    this.clientStateById.set(clientId, "ready");
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "pong", timeMs: Date.now() }),
    );
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "welcome", entityId: playerId }),
    );
    if (this.enableMatchmaking) {
      this.sendLobbyState(clientId);
    }
  }

  private requireReady(clientId: string): boolean {
    if (this.clientStateById.get(clientId) === "ready") {
      return true;
    }
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "error", message: "hello_required" }),
    );
    return false;
  }

  private getReadyPlayer(clientId: string): Player | undefined {
    const playerId = this.playerIdByClientId.get(clientId);
    if (!playerId) {
      return undefined;
    }
    return this.world.get<Player>(playerId);
  }

  private handleLobbyAction(
    clientId: string,
    message: LobbyActionMessage,
  ): void {
    switch (message.action) {
      case "join":
        this.joinAnyOpenLobby(clientId);
        return;
      case "joinByCode":
        this.joinLobbyByCode(clientId, message.lobbyCode);
        return;
      case "leave":
        this.removeClientFromMatchLobby(clientId, {
          sendDepartureMessage: true,
        });
        this.sendLobbyState(clientId, true);
        return;
      default:
        return;
    }
  }

  private joinAnyOpenLobby(clientId: string): void {
    const existingCode = this.matchLobbyCodeByClientId.get(clientId);
    if (existingCode) {
      this.sendToClientSystem(clientId, `Already in lobby ${existingCode}.`);
      this.sendLobbyState(clientId, true);
      return;
    }

    const nowMs = Date.now();
    const openLobby = this.findOpenLobby();
    const targetLobby = openLobby ?? this.createMatchLobby(nowMs);
    this.assignClientToLobby(clientId, targetLobby, nowMs);
  }

  private joinLobbyByCode(clientId: string, rawLobbyCode: string): void {
    const lobbyCode = rawLobbyCode.trim().toUpperCase();
    if (!lobbyCode) {
      this.sendToClientSystem(clientId, "Enter a lobby code first.");
      this.sendLobbyState(clientId, true);
      return;
    }

    const targetLobby = this.matchLobbyByCode.get(lobbyCode);
    if (!targetLobby) {
      this.sendToClientSystem(clientId, `Lobby ${lobbyCode} was not found.`);
      this.sendLobbyState(clientId, true);
      return;
    }

    if (targetLobby.playerClientIds.has(clientId)) {
      this.sendToClientSystem(clientId, `Already in lobby ${lobbyCode}.`);
      this.sendLobbyState(clientId, true);
      return;
    }

    if (targetLobby.playerClientIds.size >= MATCH_LOBBY_MAX_PLAYERS) {
      this.sendToClientSystem(clientId, `Lobby ${lobbyCode} is full.`);
      this.sendLobbyState(clientId, true);
      return;
    }

    const nowMs = Date.now();
    this.removeClientFromMatchLobby(clientId, {
      sendDepartureMessage: false,
    });
    this.assignClientToLobby(clientId, targetLobby, nowMs);
  }

  private assignClientToLobby(
    clientId: string,
    lobby: MatchLobby,
    nowMs: number,
  ): void {
    lobby.playerClientIds.add(clientId);
    this.matchLobbyCodeByClientId.set(clientId, lobby.code);
    this.sendToClientSystem(
      clientId,
      `Joined lobby ${lobby.code} (${lobby.playerClientIds.size}/${MATCH_LOBBY_MAX_PLAYERS}).`,
    );
    this.broadcastLobbyMessage(
      lobby,
      `${this.getPlayerDisplayName(clientId)} joined lobby ${lobby.code} (${lobby.playerClientIds.size}/${MATCH_LOBBY_MAX_PLAYERS}).`,
    );
    if (lobby.startedAtMs !== null) {
      this.migrateClientToLobbyServer(clientId, lobby);
    } else {
      this.maybeStartLobbyCountdown(lobby, nowMs);
    }
    this.broadcastLobbyState(lobby, true);
  }

  private removeClientFromMatchLobby(
    clientId: string,
    options: { sendDepartureMessage: boolean; migrateToPlayground?: boolean },
  ): void {
    const lobbyCode = this.matchLobbyCodeByClientId.get(clientId);
    if (!lobbyCode) {
      return;
    }

    const lobby = this.matchLobbyByCode.get(lobbyCode);
    this.matchLobbyCodeByClientId.delete(clientId);
    if (!lobby) {
      return;
    }

    lobby.playerClientIds.delete(clientId);
    lobby.scopedNetwork.removeClient(clientId);
    if (options.migrateToPlayground ?? true) {
      this.migrateClientToPlayground(clientId);
    }
    const playerCount = lobby.playerClientIds.size;
    if (options.sendDepartureMessage) {
      this.sendToClientSystem(clientId, `Left lobby ${lobby.code}.`);
      this.broadcastLobbyMessage(
        lobby,
        `${this.getPlayerDisplayName(clientId)} left lobby ${lobby.code} (${playerCount}/${MATCH_LOBBY_MAX_PLAYERS}).`,
      );
    }

    if (playerCount === 0) {
      lobby.gameServer.stop();
      this.matchLobbyByCode.delete(lobby.code);
      return;
    }

    if (lobby.startedAtMs === null && playerCount < 2 && lobby.countdownEndsAtMs) {
      lobby.countdownEndsAtMs = null;
      this.broadcastLobbyMessage(
        lobby,
        `Lobby ${lobby.code} countdown cancelled. Need 2 players to start.`,
      );
    }

    this.broadcastLobbyState(lobby, true);
  }

  private updateMatchLobbies(nowMs: number): void {
    for (const lobby of this.matchLobbyByCode.values()) {
      if (
        lobby.startedAtMs === null &&
        lobby.countdownEndsAtMs !== null &&
        nowMs >= lobby.countdownEndsAtMs
      ) {
        this.resetLobbyGameServer(lobby);
        lobby.startedAtMs = nowMs;
        lobby.countdownEndsAtMs = null;
        for (const clientId of lobby.playerClientIds) {
          this.migrateClientToLobbyServer(clientId, lobby);
        }
        this.broadcastLobbyMessage(
          lobby,
          `Lobby ${lobby.code} game started with ${lobby.playerClientIds.size} player(s).`,
        );
        this.broadcastLobbyState(lobby, true);
        continue;
      }

      this.broadcastLobbyState(lobby, false);
    }
  }

  private maybeStartLobbyCountdown(lobby: MatchLobby, nowMs: number): void {
    if (lobby.startedAtMs !== null || lobby.countdownEndsAtMs !== null) {
      return;
    }
    if (lobby.playerClientIds.size < 2) {
      return;
    }
    lobby.countdownEndsAtMs = nowMs + MATCH_LOBBY_START_COUNTDOWN_MS;
    this.broadcastLobbyMessage(
      lobby,
      `Lobby ${lobby.code} reached 2 players. Game starts in 10 seconds.`,
    );
  }

  private findOpenLobby(): MatchLobby | undefined {
    for (const lobby of this.matchLobbyByCode.values()) {
      if (lobby.playerClientIds.size < MATCH_LOBBY_MAX_PLAYERS) {
        return lobby;
      }
    }
    return undefined;
  }

  private createMatchLobby(nowMs: number): MatchLobby {
    const code = this.generateLobbyCode();
    const scopedNetwork = new ScopedWsServer(this.networkServer);
    const lobby: MatchLobby = {
      code,
      playerClientIds: new Set<string>(),
      createdAtMs: nowMs,
      countdownEndsAtMs: null,
      startedAtMs: null,
      scopedNetwork,
      gameServer: this.makeLobbyGameServer(scopedNetwork),
    };
    this.matchLobbyByCode.set(code, lobby);
    return lobby;
  }

  private generateLobbyCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
      code = "";
      for (let index = 0; index < MATCH_LOBBY_CODE_LENGTH; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "X";
      }
    } while (this.matchLobbyByCode.has(code));
    return code;
  }

  private makeLobbyGameServer(scopedNetwork: ScopedWsServer): GameServer {
    const lobbyGameServer = new GameServer(
      this.gameConfig,
      scopedNetwork,
      this.authService,
      { enableMatchmaking: false },
    );
    lobbyGameServer.start();
    return lobbyGameServer;
  }

  private resetLobbyGameServer(lobby: MatchLobby): void {
    lobby.gameServer.stop();
    lobby.gameServer = this.makeLobbyGameServer(lobby.scopedNetwork);
  }

  private migrateClientToLobbyServer(clientId: string, lobby: MatchLobby): void {
    if (this.activeServerByClientId.get(clientId) === lobby.gameServer) {
      lobby.scopedNetwork.addClient(clientId);
      return;
    }
    const previousServer = this.activeServerByClientId.get(clientId) ?? this;
    const playerName = previousServer.extractPlayerNameForClient(clientId);
    previousServer.detachClient(clientId);
    lobby.scopedNetwork.addClient(clientId);
    lobby.gameServer.attachMigratedClient(clientId, playerName);
    this.activeServerByClientId.set(clientId, lobby.gameServer);
  }

  private migrateClientToPlayground(clientId: string): void {
    const activeServer = this.activeServerByClientId.get(clientId);
    if (!activeServer || activeServer === this) {
      return;
    }
    const playerName = activeServer.extractPlayerNameForClient(clientId);
    activeServer.detachClient(clientId);
    for (const lobby of this.matchLobbyByCode.values()) {
      lobby.scopedNetwork.removeClient(clientId);
    }
    this.attachMigratedClient(clientId, playerName);
    this.activeServerByClientId.set(clientId, this);
  }

  private attachMigratedClient(
    clientId: string,
    requestedPlayerName?: string,
  ): void {
    if (this.playerIdByClientId.has(clientId)) {
      return;
    }
    const playerId = this.onConnect(clientId, requestedPlayerName);
    this.clientStateById.set(clientId, "ready");
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "welcome", entityId: playerId }),
    );
  }

  private detachClient(clientId: string): void {
    this.clientStateById.delete(clientId);
    this.lastInputSequenceByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
  }

  private extractPlayerNameForClient(clientId: string): string | undefined {
    return this.getReadyPlayer(clientId)?.name;
  }

  private sendLobbyState(clientId: string, force = false): void {
    const state = this.buildLobbyStateForClient(clientId);
    const serialized = JSON.stringify(state);
    if (!force && this.lastSentLobbyStateByClientId.get(clientId) === serialized) {
      return;
    }
    this.lastSentLobbyStateByClientId.set(clientId, serialized);
    this.networkServer.send(clientId, serialized);
  }

  private broadcastLobbyState(lobby: MatchLobby, force: boolean): void {
    for (const clientId of lobby.playerClientIds) {
      this.sendLobbyState(clientId, force);
    }
  }

  private buildLobbyStateForClient(clientId: string): LobbyStateMessage {
    const nowMs = Date.now();
    const lobbyCode = this.matchLobbyCodeByClientId.get(clientId);
    if (!lobbyCode) {
      return {
        t: "lobby_state",
        inLobby: false,
        playerCount: 0,
        maxPlayers: MATCH_LOBBY_MAX_PLAYERS,
        countdownEndsAtMs: null,
        startedAtMs: null,
        serverNowMs: nowMs,
      };
    }

    const lobby = this.matchLobbyByCode.get(lobbyCode);
    if (!lobby) {
      this.matchLobbyCodeByClientId.delete(clientId);
      return {
        t: "lobby_state",
        inLobby: false,
        playerCount: 0,
        maxPlayers: MATCH_LOBBY_MAX_PLAYERS,
        countdownEndsAtMs: null,
        startedAtMs: null,
        serverNowMs: nowMs,
      };
    }

    return {
      t: "lobby_state",
      inLobby: true,
      lobbyCode: lobby.code,
      playerCount: lobby.playerClientIds.size,
      maxPlayers: MATCH_LOBBY_MAX_PLAYERS,
      createdAtMs: lobby.createdAtMs,
      countdownEndsAtMs: lobby.countdownEndsAtMs,
      startedAtMs: lobby.startedAtMs,
      serverNowMs: nowMs,
    };
  }

  private broadcastLobbyMessage(lobby: MatchLobby, text: string): void {
    for (const clientId of lobby.playerClientIds) {
      this.sendToClientSystem(clientId, text);
    }
  }

  private sendToClientSystem(clientId: string, text: string): void {
    const message: ServerToClientMessage = {
      t: "chat",
      text,
      kind: "system",
    };
    this.networkServer.send(clientId, JSON.stringify(message));
  }

  private getPlayerDisplayName(clientId: string): string {
    return this.getReadyPlayer(clientId)?.name ?? "Player";
  }

  private rejectInput(
    clientId: string,
    player: Player,
    reason: "stale_input" | "invalid_input",
    payload: ActionMessage | AimMessage | MoveIntentMessage,
  ): void {
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "error", message: reason }),
    );
    if (!this.world.focusedTrace.matchesEntity(player)) {
      return;
    }
    this.world.focusedTrace.recordEntityEvent(
      this.world,
      "input_rejected",
      player,
      {
        reason,
        clientId,
        rawInput: structuredClone(payload),
        lastAcceptedSequence:
          this.lastInputSequenceByClientId.get(clientId) ?? -1,
      },
    );
  }

  private sanitizePlayerName(
    requestedPlayerName: string | undefined,
    fallbackPlayerName: string,
  ): string {
    const sanitizedPlayerName = (requestedPlayerName ?? "")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .trim()
      .slice(0, 20);
    return sanitizedPlayerName || fallbackPlayerName;
  }
}

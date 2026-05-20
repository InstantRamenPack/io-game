import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  encodeServerToClientMessage,
  type HelloMessage,
  type LobbyActionMessage,
  type LobbyStateMessage,
  parseClientToServerMessage,
  type PingMessage,
  type ServerToClientMessage,
} from "@shared/net/protocol.ts";
import { normalizePlayerName } from "@shared/playerName.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { ScopedWsServer } from "@server/net/ScopedWsServer.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { TickClock } from "@server/server/TickClock.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import { LobbyStateCache } from "@server/server/matchmaking/LobbyStateCache.ts";
import { matchmakingConfig } from "@shared/config/gameplayConfig.ts";

type MatchLobby = {
  code: string;
  seed: number;
  hostClientId: string | null;
  playerClientIds: Set<string>;
  createdAtMs: number;
  countdownEndsAtMs: number | null;
  startedAtMs: number | null;
  gameCompletedAtMs: number | null;
  gameFailedAtMs: number | null;
  scopedNetwork: ScopedWsServer;
  runtime: GameInstanceRuntime | null;
};

/**
 * Authoritative server runtime for players, input handling, and snapshot output.
 * This class owns transport and orchestrates one playground instance plus lobby instances.
 */
export class GameServer {
  public readonly world: GameInstanceRuntime["world"];
  public readonly networkServer: NetworkServerLike;
  public readonly snapshotManager: GameInstanceRuntime["snapshotManager"];
  public readonly antiCheatValidator: GameInstanceRuntime["antiCheatValidator"];
  public readonly chatService: GameInstanceRuntime["chatService"];

  private readonly gameConfig: GameConfig;
  private readonly clock: TickClock;
  private readonly enableMatchmaking: boolean;
  private readonly playgroundRuntime: GameInstanceRuntime;
  private readonly clientStateById = new Map<
    string,
    "connected" | "hello_pending" | "preview" | "ready"
  >();
  private readonly activeRuntimeByClientId = new Map<
    string,
    GameInstanceRuntime
  >();
  private readonly matchLobbyByCode = new Map<string, MatchLobby>();
  private readonly matchLobbyCodeByClientId = new Map<string, string>();
  private readonly lobbyStateCache = new LobbyStateCache();

  constructor(
    gameConfig: GameConfig,
    networkServer: NetworkServerLike,
    options: { enableMatchmaking?: boolean } = {},
  ) {
    bootstrapTypeRegistries();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.enableMatchmaking = options.enableMatchmaking ?? true;
    this.playgroundRuntime = new GameInstanceRuntime(
      gameConfig,
      networkServer,
      {
        isPlayground: true,
      },
    );
    this.world = this.playgroundRuntime.world;
    this.snapshotManager = this.playgroundRuntime.snapshotManager;
    this.antiCheatValidator = this.playgroundRuntime.antiCheatValidator;
    this.chatService = this.playgroundRuntime.chatService;
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

  public start(): void {
    this.clock.start(() => this.tick());
  }

  public stop(): void {
    this.clock.stop();
    if (!this.enableMatchmaking) {
      return;
    }

    this.matchLobbyByCode.clear();
    this.matchLobbyCodeByClientId.clear();
    this.lobbyStateCache.clearAll();
    this.activeRuntimeByClientId.clear();
  }

  public tick(): void {
    this.playgroundRuntime.tick();

    if (!this.enableMatchmaking) {
      return;
    }

    const nowMs = Date.now();
    this.updateMatchLobbies(nowMs);
    for (const lobby of this.matchLobbyByCode.values()) {
      lobby.runtime?.tick();
    }

    for (const lobby of this.matchLobbyByCode.values()) {
      if (lobby.runtime?.isGameComplete() && lobby.gameCompletedAtMs === null) {
        lobby.gameCompletedAtMs = nowMs;
        this.broadcastGameComplete(lobby, nowMs);
      }
      if (lobby.runtime?.isGameFailed() && lobby.gameFailedAtMs === null) {
        lobby.gameFailedAtMs = nowMs;
        this.broadcastGameFailed(lobby, nowMs);
      }
    }
  }

  public onDisconnect(clientId: string): void {
    if (this.enableMatchmaking) {
      this.removeClientFromMatchLobby(clientId, {
        sendDepartureMessage: true,
        migrateToPlayground: false,
      });
      this.lobbyStateCache.clear(clientId);
    }

    this.clientStateById.delete(clientId);
    this.playgroundRuntime.detachClient(clientId);
    const runtime = this.activeRuntimeByClientId.get(clientId);
    if (runtime !== this.playgroundRuntime) {
      runtime?.detachClient(clientId);
    }
    this.activeRuntimeByClientId.delete(clientId);
  }

  private handleRawMessage(
    clientId: string,
    rawMessage: string | Uint8Array,
  ): void {
    const clientMessage = parseClientToServerMessage(rawMessage);
    if (!clientMessage) {
      return;
    }

    switch (clientMessage.t) {
      case "hello":
        void this.handleHello(clientId, clientMessage);
        return;
      case "input":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.getActiveRuntime(clientId).handleInputIntent(
          clientId,
          clientMessage,
        );
        return;
      case "action":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.getActiveRuntime(clientId).handleAction(clientId, clientMessage);
        return;
      case "respawn":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.getActiveRuntime(clientId).handleRespawn(clientId);
        return;
      case "chat":
        if (!this.requireReady(clientId)) {
          return;
        }
        this.getActiveRuntime(clientId).handleChat(
          clientId,
          clientMessage.text,
        );
        return;
      case "lobby": {
        if (!this.requireReady(clientId)) {
          return;
        }
        if (!this.enableMatchmaking) {
          return;
        }
        const activeRuntime = this.getActiveRuntime(clientId);
        const inPlayground = activeRuntime === this.playgroundRuntime;
        const canJoinFromEndedRuntime =
          this.canRejoinLobbyFromEndedRuntime(clientId);
        if (!inPlayground && !canJoinFromEndedRuntime) {
          return;
        }
        this.handleLobbyAction(clientId, clientMessage);
        return;
      }
      case "ping": {
        const pingMessage = clientMessage as PingMessage;
        const pongMessage: ServerToClientMessage = {
          t: "pong",
          timeMs: pingMessage.timeMs,
        };
        this.networkServer.send(
          clientId,
          encodeServerToClientMessage(pongMessage),
        );
        return;
      }
      default:
        this.networkServer.send(
          clientId,
          encodeServerToClientMessage({
            t: "error",
            message: "unknown_message_type",
          }),
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
        encodeServerToClientMessage({ t: "error", message: "compat_mismatch" }),
      );
      this.networkServer.disconnect(clientId, "compat_mismatch");
      return;
    }

    if (helloMessage.preview === true) {
      this.playgroundRuntime.connectPreviewClient(clientId);
      this.clientStateById.set(clientId, "preview");
      this.networkServer.send(
        clientId,
        encodeServerToClientMessage({ t: "pong", timeMs: Date.now() }),
      );
      return;
    }

    if (
      this.playgroundRuntime.getPlayerCount() >=
      this.gameConfig.network.maxPlayers
    ) {
      this.networkServer.send(
        clientId,
        encodeServerToClientMessage({ t: "error", message: "server_full" }),
      );
      this.networkServer.disconnect(clientId, "server_full");
      return;
    }

    const playerName = normalizePlayerName(helloMessage.playerName, "");
    if (!playerName) {
      this.networkServer.send(
        clientId,
        encodeServerToClientMessage({ t: "error", message: "name_required" }),
      );
      this.networkServer.disconnect(clientId, "name_required");
      return;
    }
    if (this.isPlayerNameInUse(playerName)) {
      this.networkServer.send(
        clientId,
        encodeServerToClientMessage({ t: "error", message: "name_taken" }),
      );
      this.networkServer.disconnect(clientId, "name_taken");
      return;
    }

    const playerId = this.playgroundRuntime.connectReadyClient(
      clientId,
      playerName,
    );
    this.activeRuntimeByClientId.set(clientId, this.playgroundRuntime);
    this.clientStateById.set(clientId, "ready");
    this.networkServer.send(
      clientId,
      encodeServerToClientMessage({ t: "pong", timeMs: Date.now() }),
    );
    this.networkServer.send(
      clientId,
      encodeServerToClientMessage({
        t: "welcome",
        entityId: playerId,
        worldId: this.playgroundRuntime.worldId,
      }),
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
      encodeServerToClientMessage({ t: "error", message: "hello_required" }),
    );
    return false;
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
        if (!this.matchLobbyCodeByClientId.has(clientId)) {
          this.migrateClientToPlayground(clientId);
        } else {
          this.removeClientFromMatchLobby(clientId, {
            sendDepartureMessage: true,
          });
        }
        this.sendLobbyState(clientId, true);
        return;
      case "start":
        this.startLobbyByClientRequest(clientId);
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

    const nowMs = Date.now();
    const targetLobby =
      this.matchLobbyByCode.get(lobbyCode) ??
      this.createMatchLobby(nowMs, lobbyCode);

    if (targetLobby.playerClientIds.has(clientId)) {
      this.sendToClientSystem(clientId, `Already in lobby ${lobbyCode}.`);
      this.sendLobbyState(clientId, true);
      return;
    }

    if (targetLobby.playerClientIds.size >= matchmakingConfig.maxPlayers) {
      this.sendToClientSystem(clientId, `Lobby ${lobbyCode} is full.`);
      this.sendLobbyState(clientId, true);
      return;
    }

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
    if (lobby.hostClientId === null) {
      lobby.hostClientId = clientId;
    }
    this.matchLobbyCodeByClientId.set(clientId, lobby.code);
    this.sendToClientSystem(
      clientId,
      `Joined lobby ${lobby.code} (${lobby.playerClientIds.size}/${matchmakingConfig.maxPlayers}).`,
    );
    this.broadcastLobbyMessage(
      lobby,
      `${this.getPlayerDisplayName(clientId)} joined lobby ${lobby.code} (${lobby.playerClientIds.size}/${matchmakingConfig.maxPlayers}).`,
    );

    if (lobby.startedAtMs !== null) {
      this.migrateClientToLobbyRuntime(clientId, lobby);
    } else {
      // While queued (pre-match), keep clients in playground/main lobby runtime.
      this.migrateClientToPlayground(clientId);
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
    if (lobby.hostClientId === clientId) {
      const nextHost = lobby.playerClientIds.values().next().value;
      lobby.hostClientId = typeof nextHost === "string" ? nextHost : null;
    }
    lobby.scopedNetwork.removeClient(clientId);
    if (options.migrateToPlayground ?? true) {
      this.migrateClientToPlayground(clientId);
    }

    const playerCount = lobby.playerClientIds.size;
    if (options.sendDepartureMessage) {
      this.sendToClientSystem(clientId, `Left lobby ${lobby.code}.`);
      this.broadcastLobbyMessage(
        lobby,
        `${this.getPlayerDisplayName(clientId)} left lobby ${lobby.code} (${playerCount}/${matchmakingConfig.maxPlayers}).`,
      );
    }

    if (playerCount === 0) {
      this.matchLobbyByCode.delete(lobby.code);
      lobby.runtime = null;
      return;
    }

    if (
      lobby.startedAtMs === null &&
      playerCount < 2 &&
      lobby.countdownEndsAtMs
    ) {
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
        this.startLobby(lobby, nowMs);
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
    lobby.countdownEndsAtMs = nowMs + matchmakingConfig.startCountdownMs;
    this.broadcastLobbyMessage(
      lobby,
      `Lobby ${lobby.code} reached 2 players. Game starts in 10 seconds.`,
    );
  }

  private startLobbyByClientRequest(clientId: string): void {
    const lobbyCode = this.matchLobbyCodeByClientId.get(clientId);
    if (!lobbyCode) {
      this.sendToClientSystem(clientId, "Join a lobby before starting.");
      this.sendLobbyState(clientId, true);
      return;
    }

    const lobby = this.matchLobbyByCode.get(lobbyCode);
    if (!lobby || lobby.startedAtMs !== null) {
      this.sendLobbyState(clientId, true);
      return;
    }

    if (lobby.playerClientIds.size < 1) {
      this.sendToClientSystem(clientId, "Need at least 1 player to start.");
      this.sendLobbyState(clientId, true);
      return;
    }

    this.startLobby(lobby, Date.now());
  }

  private startLobby(lobby: MatchLobby, nowMs: number): void {
    this.resetLobbyRuntime(lobby);
    lobby.startedAtMs = nowMs;
    lobby.countdownEndsAtMs = null;
    for (const clientId of lobby.playerClientIds) {
      this.migrateClientToLobbyRuntime(clientId, lobby);
    }
    this.broadcastLobbyMessage(
      lobby,
      `Lobby ${lobby.code} game started with ${lobby.playerClientIds.size} player(s).`,
    );
    this.broadcastLobbyState(lobby, true);
  }

  private findOpenLobby(): MatchLobby | undefined {
    for (const lobby of this.matchLobbyByCode.values()) {
      if (lobby.playerClientIds.size < matchmakingConfig.maxPlayers) {
        return lobby;
      }
    }
    return undefined;
  }

  private createMatchLobby(nowMs: number, requestedCode?: string): MatchLobby {
    const code = requestedCode ?? this.generateLobbyCode();
    const scopedNetwork = new ScopedWsServer(this.networkServer);
    const lobby: MatchLobby = {
      code,
      seed: hashLobbyCodeToSeed(code),
      hostClientId: null,
      playerClientIds: new Set<string>(),
      createdAtMs: nowMs,
      countdownEndsAtMs: null,
      startedAtMs: null,
      gameCompletedAtMs: null,
      gameFailedAtMs: null,
      scopedNetwork,
      runtime: null,
    };
    this.matchLobbyByCode.set(code, lobby);
    return lobby;
  }

  private broadcastGameComplete(lobby: MatchLobby, nowMs: number): void {
    const gameDurationMs =
      lobby.startedAtMs !== null ? nowMs - lobby.startedAtMs : 0;
    const wavesCompleted = lobby.runtime?.getWavesCompleted() ?? 0;
    const message: ServerToClientMessage = {
      t: "game_complete",
      gameDurationMs,
      wavesCompleted,
    };
    const payload = encodeServerToClientMessage(message);
    for (const clientId of lobby.playerClientIds) {
      this.networkServer.send(clientId, payload);
    }
  }

  private broadcastGameFailed(lobby: MatchLobby, nowMs: number): void {
    const gameDurationMs =
      lobby.startedAtMs !== null ? nowMs - lobby.startedAtMs : 0;
    const wavesCompleted = lobby.runtime?.getWavesCompleted() ?? 0;
    const message: ServerToClientMessage = {
      t: "game_over",
      gameDurationMs,
      wavesCompleted,
    };
    const payload = encodeServerToClientMessage(message);
    const participantClientIds = [...lobby.playerClientIds];
    for (const clientId of participantClientIds) {
      this.networkServer.send(clientId, payload);
    }

    // Reset lobby back to pre-match state and destroy the finished runtime.
    lobby.startedAtMs = null;
    lobby.gameCompletedAtMs = null;
    lobby.gameFailedAtMs = null;
    lobby.runtime = null;

    // A failed run should not keep players queued; each player must opt in again.
    lobby.playerClientIds.clear();
    for (const clientId of participantClientIds) {
      this.matchLobbyCodeByClientId.delete(clientId);
      this.sendLobbyState(clientId, true);
    }

    if (lobby.playerClientIds.size === 0) {
      this.matchLobbyByCode.delete(lobby.code);
      return;
    }
    this.maybeStartLobbyCountdown(lobby, nowMs);
    this.broadcastLobbyState(lobby, true);
  }

  private canRejoinLobbyFromEndedRuntime(clientId: string): boolean {
    if (this.matchLobbyCodeByClientId.has(clientId)) {
      return false;
    }

    const activeRuntime = this.activeRuntimeByClientId.get(clientId);
    if (!activeRuntime || activeRuntime === this.playgroundRuntime) {
      return false;
    }

    for (const lobby of this.matchLobbyByCode.values()) {
      if (lobby.runtime === activeRuntime) {
        return false;
      }
    }
    return true;
  }

  private generateLobbyCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWYZ";
    let code: string;
    do {
      code = "";
      for (let index = 0; index < matchmakingConfig.codeLength; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "X";
      }
    } while (this.matchLobbyByCode.has(code));
    return code;
  }

  private resetLobbyRuntime(lobby: MatchLobby): void {
    lobby.runtime = new GameInstanceRuntime(
      this.gameConfig,
      lobby.scopedNetwork,
      { worldSeed: lobby.seed },
    );
    lobby.gameCompletedAtMs = null;
    lobby.gameFailedAtMs = null;
  }

  private migrateClientToLobbyRuntime(
    clientId: string,
    lobby: MatchLobby,
  ): void {
    if (!lobby.runtime) {
      return;
    }

    if (this.activeRuntimeByClientId.get(clientId) === lobby.runtime) {
      lobby.scopedNetwork.addClient(clientId);
      return;
    }

    const previousRuntime = this.getActiveRuntime(clientId);
    const playerName = previousRuntime.detachClient(clientId);
    lobby.scopedNetwork.addClient(clientId);
    const playerId = lobby.runtime.connectReadyClient(clientId, playerName);
    this.activeRuntimeByClientId.set(clientId, lobby.runtime);
    this.networkServer.send(
      clientId,
      encodeServerToClientMessage({
        t: "welcome",
        entityId: playerId,
        worldId: lobby.runtime.worldId,
      }),
    );
  }

  private migrateClientToPlayground(clientId: string): void {
    const activeRuntime = this.activeRuntimeByClientId.get(clientId);
    if (!activeRuntime || activeRuntime === this.playgroundRuntime) {
      return;
    }

    const playerName = activeRuntime.detachClient(clientId);
    for (const lobby of this.matchLobbyByCode.values()) {
      lobby.scopedNetwork.removeClient(clientId);
    }
    const playerId = this.playgroundRuntime.connectReadyClient(
      clientId,
      playerName,
    );
    this.activeRuntimeByClientId.set(clientId, this.playgroundRuntime);
    this.networkServer.send(
      clientId,
      encodeServerToClientMessage({
        t: "welcome",
        entityId: playerId,
        worldId: this.playgroundRuntime.worldId,
      }),
    );
  }

  private getActiveRuntime(clientId: string): GameInstanceRuntime {
    return this.activeRuntimeByClientId.get(clientId) ?? this.playgroundRuntime;
  }

  private sendLobbyState(clientId: string, force = false): void {
    const state = this.buildLobbyStateForClient(clientId);
    if (!this.lobbyStateCache.shouldSend(clientId, state, force)) {
      return;
    }
    this.networkServer.send(clientId, encodeServerToClientMessage(state));
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
        isHost: false,
        playerCount: 0,
        maxPlayers: matchmakingConfig.maxPlayers,
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
        isHost: false,
        playerCount: 0,
        maxPlayers: matchmakingConfig.maxPlayers,
        countdownEndsAtMs: null,
        startedAtMs: null,
        serverNowMs: nowMs,
      };
    }

    return {
      t: "lobby_state",
      inLobby: true,
      isHost: lobby.hostClientId === clientId,
      lobbyCode: lobby.code,
      playerCount: lobby.playerClientIds.size,
      maxPlayers: matchmakingConfig.maxPlayers,
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
    this.networkServer.send(clientId, encodeServerToClientMessage(message));
  }

  private getPlayerDisplayName(clientId: string): string {
    return this.getActiveRuntime(clientId).getPlayerName(clientId) ?? "Player";
  }

  private isPlayerNameInUse(playerName: string): boolean {
    if (this.playgroundRuntime.hasPlayerName(playerName)) {
      return true;
    }
    for (const lobby of this.matchLobbyByCode.values()) {
      if (lobby.runtime?.hasPlayerName(playerName)) {
        return true;
      }
    }
    return false;
  }
}

function hashLobbyCodeToSeed(lobbyCode: string): number {
  let hash = 2166136261;
  for (let index = 0; index < lobbyCode.length; index += 1) {
    hash ^= lobbyCode.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

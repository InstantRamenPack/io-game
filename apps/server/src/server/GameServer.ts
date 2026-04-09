import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  type ActionMessage,
  type HelloMessage,
  type MoveIntentMessage,
  parseClientToServerMessage,
  type PingMessage,
  type ServerToClientMessage,
} from "@shared/net/protocol.ts";
import { ChatService } from "@server/chat/ChatService.ts";
import { Player } from "@server/entities/Player.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import type { WsServer } from "@server/net/WsServer.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  applyPlayerStarterLoadout,
  validatePlayerStarterLoadout,
} from "@server/server/starterLoadout.ts";
import { TickClock } from "@server/server/TickClock.ts";
import type { AuthService } from "@server/services/AuthService.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { World } from "@server/world/World.ts";

/**
 * Authoritative server runtime for players, input handling, and snapshot output.
 * This class coordinates the world, networking layer, and tick loop.
 */
export class GameServer {
  public world: World;
  public networkServer: WsServer;
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

  constructor(
    gameConfig: GameConfig,
    networkServer: WsServer,
    authService: AuthService,
  ) {
    bootstrapTypeRegistries();
    validatePlayerStarterLoadout();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.authService = authService;
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
    try {
      this.world.waveSystem = WaveSystem.loadFromFile({
        dayNightSystem: this.world.dayNightSystem,
        configPath: "./apps/server/src/config/waves.json",
        chatService: this.chatService,
      });
      console.log("✓ Wave spawning system initialized");
    } catch (error) {
      console.error("Failed to initialize wave spawning:", error);
      // Game continues without wave spawning
    }
  }

  public start(): void {
    this.clock.start(() => this.tick());
  }

  public stop(): void {
    this.clock.stop();
  }

  public tick(): void {
    this.world.step();
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

    if (!this.antiCheatValidator.validateMoveIntent(moveIntent)) {
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
          queueLength: player.queuedActions.length,
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

    return playerId;
  }

  public onDisconnect(clientId: string): void {
    this.clientStateById.delete(clientId);
    this.lastInputSequenceByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
  }

  private handleRawMessage(clientId: string, rawMessage: string): void {
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

  private rejectInput(
    clientId: string,
    player: Player,
    reason: "stale_input" | "invalid_input",
    payload: ActionMessage | MoveIntentMessage,
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

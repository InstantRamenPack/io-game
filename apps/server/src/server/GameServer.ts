import { GameConfig } from "@shared/config/GameConfig.ts";
import { IdGenerator } from "@shared/math/IdGenerator.ts";
import {
  type HelloMessage,
  type InputCommand,
  type InputMessage,
  type PingMessage,
  PROTOCOL_VERSION,
  type ServerToClientMessage,
  parseClientToServerMessage,
} from "@shared/net/protocol.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import { WsServer } from "@server/net/WsServer.ts";
import { Player } from "@server/entities/Player.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";
import { TickClock } from "@server/server/TickClock.ts";
import { CollisionSystem } from "@server/systems/CollisionSystem.ts";
import { GoalSystem } from "@server/systems/GoalSystem.ts";
import { World } from "@server/world/World.ts";
import type { System } from "@server/systems/System.ts";
import { AuthService } from "@server/services/AuthService.ts";

/**
 * Authoritative server runtime for players, input handling, and snapshot output.
 * This class coordinates the world, networking layer, and tick loop.
 */
export class GameServer {
  world: World;
  systems: System[] = [];
  networkServer: WsServer;
  snapshotManager: SnapshotManager;
  antiCheatValidator: AntiCheatValidator;
  preStepSystems: System[] = [];

  private readonly gameConfig: GameConfig;
  private readonly clock: TickClock;
  private readonly authService: AuthService;
  private readonly entityIdGenerator = new IdGenerator();
  private readonly playerIdByClientId = new Map<string, number>();
  private readonly clientsWithCompletedHello = new Set<string>();
  private readonly clientsWithPendingHello = new Set<string>();
  private readonly lastInputSequenceByClientId = new Map<string, number>();
  private readonly lastInputTickByClientId = new Map<string, number>();
  private initialZombiesSpawned = false;

  /**
   * Wires server subsystems and WebSocket event handlers.
   * @param gameConfig Shared runtime configuration.
   * @param networkServer Socket registry and transport helper.
   * @param authService Optional Google token verification service.
   */
  constructor(
    gameConfig: GameConfig,
    networkServer: WsServer,
    authService: AuthService,
  ) {
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.authService = authService;
    this.world = new World(gameConfig);
    this.snapshotManager = new SnapshotManager(
      gameConfig.snapshotRate,
      gameConfig.tickRate,
    );
    this.antiCheatValidator = new AntiCheatValidator();
    this.clock = new TickClock(gameConfig.tickRate);
    this.preStepSystems = [new GoalSystem()];
    this.systems = [new CollisionSystem()];

    this.networkServer.onClose((clientId) => {
      this.onDisconnect(clientId);
    });

    this.networkServer.onMessage((clientId, rawMessage) => {
      this.handleRawMessage(clientId, rawMessage);
    });
  }

  /**
   * Starts the fixed-tick server clock.
   */
  start(): void {
    if (!this.initialZombiesSpawned) {
      this.spawnInitialZombies();
      this.initialZombiesSpawned = true;
    }
    this.clock.start((deltaMs) => this.tick(deltaMs));
  }

  /**
   * Stops the fixed-tick server clock.
   */
  stop(): void {
    this.clock.stop();
  }

  /**
   * Processes one server tick and broadcasts snapshots on the configured cadence.
   * @param deltaMs Tick delta in milliseconds.
   */
  tick(deltaMs: number): void {
    const simulationTick = this.world.tick + 1;

    for (const [, playerId] of this.playerIdByClientId) {
      const player = this.world.get<Player>(playerId);
      if (player) {
        player.applyInputForTick(this.world, simulationTick);
      }
    }

    for (const system of this.preStepSystems) {
      system.update(this.world, deltaMs);
    }

    this.world.step(deltaMs);

    for (const system of this.systems) {
      system.update(this.world, deltaMs);
    }

    if (this.snapshotManager.shouldSendSnapshot(this.world.tick)) {
      const snapshot = this.snapshotManager.makeSnapshot(this.world);
      const snapshotMessage: ServerToClientMessage = {
        t: "snapshot",
        snapshot,
      };
      this.networkServer.broadcast(JSON.stringify(snapshotMessage));
    }
  }

  /**
   * Validates and buffers client input for the associated player.
   * @param clientId Connected client id.
   * @param inputCommand Parsed input command from that client.
   */
  handleInput(clientId: string, inputCommand: InputCommand): void {
    const playerId = this.playerIdByClientId.get(clientId);
    if (!playerId) {
      return;
    }

    const player = this.world.get<Player>(playerId);
    if (!player) {
      return;
    }

    const lastInputSequence =
      this.lastInputSequenceByClientId.get(clientId) ?? -1;
    const lastInputTick = this.lastInputTickByClientId.get(clientId) ?? -1;
    if (
      inputCommand.seq <= lastInputSequence ||
      inputCommand.tick < lastInputTick
    ) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "stale_input" }),
      );
      return;
    }

    if (!this.antiCheatValidator.validate(inputCommand, player)) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "invalid_input" }),
      );
      return;
    }

    player.enqueueInput(inputCommand);
    this.lastInputSequenceByClientId.set(clientId, inputCommand.seq);
    this.lastInputTickByClientId.set(clientId, inputCommand.tick);
  }

  /**
   * Creates a player entity for a newly connected client.
   * @param clientId Connected client id.
   * @returns Allocated player entity id.
   */
  onConnect(clientId: string): number {
    const existingPlayerId = this.playerIdByClientId.get(clientId);
    if (existingPlayerId) {
      return existingPlayerId;
    }

    const playerId = this.entityIdGenerator.alloc();
    const playerEntity = new Player(playerId, `player-${playerId}`);

    playerEntity.x = this.gameConfig.worldSize.w / 2;
    playerEntity.y = this.gameConfig.worldSize.h / 2;

    this.world.spawn(playerEntity);
    this.playerIdByClientId.set(clientId, playerId);
    this.lastInputSequenceByClientId.set(clientId, -1);
    this.lastInputTickByClientId.set(clientId, -1);

    return playerId;
  }

  /**
   * Cleans up runtime state for a disconnected client.
   * @param clientId Disconnected client id.
   */
  onDisconnect(clientId: string): void {
    this.clientsWithCompletedHello.delete(clientId);
    this.clientsWithPendingHello.delete(clientId);
    this.lastInputSequenceByClientId.delete(clientId);
    this.lastInputTickByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
  }

  /**
   * Spawns the initial set of zombies at deterministic map locations.
   */
  private spawnInitialZombies(): void {
    const zombiePositions = [
      { x: this.gameConfig.worldSize.w * 0.25, y: this.gameConfig.worldSize.h * 0.25 },
      { x: this.gameConfig.worldSize.w * 0.75, y: this.gameConfig.worldSize.h * 0.25 },
      { x: this.gameConfig.worldSize.w * 0.25, y: this.gameConfig.worldSize.h * 0.75 },
      { x: this.gameConfig.worldSize.w * 0.75, y: this.gameConfig.worldSize.h * 0.75 },
    ];

    for (const zombiePosition of zombiePositions) {
      const zombie = new Zombie(this.entityIdGenerator.alloc());
      zombie.x = zombiePosition.x;
      zombie.y = zombiePosition.y;
      this.world.spawn(zombie);
    }
  }

  /**
   * Parses and routes protocol messages from a client.
   * @param clientId Connected client id.
   * @param rawMessage Raw JSON protocol payload.
   */
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
      case "input":
        if (!this.clientsWithCompletedHello.has(clientId)) {
          this.networkServer.send(
            clientId,
            JSON.stringify({ t: "error", message: "hello_required" }),
          );
          return;
        }
        this.handleInput(clientId, (clientMessage as InputMessage).cmd);
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

  /**
   * Verifies protocol compatibility and marks the client handshake as complete.
   * @param clientId Connected client id.
   * @param helloMessage Parsed hello payload.
   */
  private async handleHello(
    clientId: string,
    helloMessage: HelloMessage,
  ): Promise<void> {
    if (this.clientsWithCompletedHello.has(clientId)) {
      return;
    }

    if (this.clientsWithPendingHello.has(clientId)) {
      return;
    }
    if (helloMessage.protocolVersion !== PROTOCOL_VERSION) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "protocol_mismatch" }),
      );
      this.networkServer.disconnect(clientId, "protocol_mismatch");
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

      this.clientsWithPendingHello.add(clientId);
      const authenticatedUser = await this.authService.verifyGoogleIdToken(
        helloMessage.googleIdToken,
      );
      if (!this.clientsWithPendingHello.has(clientId)) {
        return;
      }
      this.clientsWithPendingHello.delete(clientId);
      if (!authenticatedUser) {
        this.networkServer.send(
          clientId,
          JSON.stringify({ t: "error", message: "auth_invalid" }),
        );
        this.networkServer.disconnect(clientId, "auth_invalid");
        return;
      }
    }

    const playerId = this.onConnect(clientId);
    this.clientsWithCompletedHello.add(clientId);
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "pong", timeMs: Date.now() }),
    );
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "welcome", entityId: playerId }),
    );
  }
}

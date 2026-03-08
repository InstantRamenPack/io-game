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
import { TickClock } from "@server/server/TickClock.ts";
import { World } from "@server/world/World.ts";
import type { System } from "@server/systems/System.ts";

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

  private readonly gameConfig: GameConfig;
  private readonly clock: TickClock;
  private readonly entityIdGenerator = new IdGenerator();
  private readonly playerIdByClientId = new Map<string, number>();
  private readonly clientsWithCompletedHello = new Set<string>();
  private readonly lastInputSequenceByClientId = new Map<string, number>();
  private readonly lastInputTickByClientId = new Map<string, number>();

  /**
   * Wires server subsystems and WebSocket event handlers.
   * @param gameConfig Shared runtime configuration.
   * @param networkServer Socket registry and transport helper.
   */
  constructor(gameConfig: GameConfig, networkServer: WsServer) {
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.world = new World(gameConfig);
    this.snapshotManager = new SnapshotManager(
      gameConfig.snapshotRate,
      gameConfig.tickRate,
    );
    this.antiCheatValidator = new AntiCheatValidator();
    this.clock = new TickClock(gameConfig.tickRate);

    this.networkServer.onOpen((clientId) => {
      this.onConnect(clientId);
    });

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
    this.world.step(deltaMs);

    for (const [, playerId] of this.playerIdByClientId) {
      const player = this.world.get<Player>(playerId);
      if (player) {
        player.applyInputForTick(this.world, this.world.tick);
      }
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
    this.lastInputSequenceByClientId.delete(clientId);
    this.lastInputTickByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
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
        this.handleHello(clientId, clientMessage);
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
  private handleHello(clientId: string, helloMessage: HelloMessage): void {
    if (helloMessage.protocolVersion !== PROTOCOL_VERSION) {
      this.networkServer.send(
        clientId,
        JSON.stringify({ t: "error", message: "protocol_mismatch" }),
      );
      this.networkServer.disconnect(clientId, "protocol_mismatch");
      return;
    }

    this.clientsWithCompletedHello.add(clientId);
    this.networkServer.send(
      clientId,
      JSON.stringify({ t: "pong", timeMs: Date.now() }),
    );
  }
}

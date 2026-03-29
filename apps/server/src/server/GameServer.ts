import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  type HelloMessage,
  type InputCommand,
  type InputMessage,
  type PingMessage,
  type ServerToClientMessage,
  parseClientToServerMessage,
} from "@shared/net/protocol.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import type { WsServer } from "@server/net/WsServer.ts";
import type { Building } from "@server/entities/Building.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Player } from "@server/entities/Player.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { TickClock } from "@server/server/TickClock.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import type { AuthService } from "@server/services/AuthService.ts";

/**
 * Authoritative server runtime for players, input handling, and snapshot output.
 * This class coordinates the world, networking layer, and tick loop.
 */
export class GameServer {
  public world: World;
  public networkServer: WsServer;
  public snapshotManager: SnapshotManager;
  public antiCheatValidator: AntiCheatValidator;

  private readonly gameConfig: GameConfig;
  private readonly clock: TickClock;
  private readonly authService: AuthService;
  private readonly playerIdByClientId = new Map<string, number>();
  private readonly clientStateById = new Map<
    string,
    "connected" | "hello_pending" | "ready"
  >();
  private readonly lastInputSequenceByClientId = new Map<string, number>();
  private readonly lastInputTickByClientId = new Map<string, number>();
  private initialEnemiesSpawned = false;
  private initialBuildingsSpawned = false;

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
    bootstrapTypeRegistries();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.authService = authService;
    this.world = new World(gameConfig);
    this.snapshotManager = new SnapshotManager();
    this.antiCheatValidator = new AntiCheatValidator();
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
   * Starts the fixed-tick server clock.
   */
  start(): void {
    if (!this.initialEnemiesSpawned) {
      this.spawnInitialEnemies();
      this.initialEnemiesSpawned = true;
    }
    if (!this.initialBuildingsSpawned) {
      this.spawnInitialBuildings();
      this.initialBuildingsSpawned = true;
    }
    this.clock.start(() => this.tick());
  }

  /**
   * Stops the fixed-tick server clock.
   */
  stop(): void {
    this.clock.stop();
  }

  /**
   * Processes one fixed server tick and broadcasts a snapshot after it completes.
   */
  tick(): void {
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

    if (!this.antiCheatValidator.validate(inputCommand, player, this.world)) {
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
   * @param requestedPlayerName Optional requested display name from the hello handshake.
   * @returns Allocated player entity id.
   */
  onConnect(clientId: string, requestedPlayerName?: string): number {
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
    if (playerEntity.inventory) {
      playerEntity.inventory.addWeapon(new BasicSword());
      playerEntity.inventory.addWeapon(new BasicGun());
      playerEntity.inventory.addWeapon(new BasicSpear());
      playerEntity.inventory.addWeapon(new Crossbow());
      playerEntity.inventory.setActiveWeaponIndex(1);
    }
    playerEntity.seedStarterInventory();

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
    this.clientStateById.delete(clientId);
    this.lastInputSequenceByClientId.delete(clientId);
    this.lastInputTickByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
  }

  /**
   * Spawns the initial set of enemies at deterministic map locations.
   */
  private spawnInitialEnemies(): void {
    const drifterPositions = [
      {
        x: this.gameConfig.worldSize.w * 0.25,
        y: this.gameConfig.worldSize.h * 0.25,
      },
      {
        x: this.gameConfig.worldSize.w * 0.75,
        y: this.gameConfig.worldSize.h * 0.25,
      },
      {
        x: this.gameConfig.worldSize.w * 0.25,
        y: this.gameConfig.worldSize.h * 0.75,
      },
      {
        x: this.gameConfig.worldSize.w * 0.75,
        y: this.gameConfig.worldSize.h * 0.75,
      },
    ];

    for (const drifterPosition of drifterPositions) {
      this.spawnInitialCopies(() => {
        const drifter = new Drifter(this.world.allocEntityId());
        drifter.x = drifterPosition.x;
        drifter.y = drifterPosition.y;
        this.world.spawn(drifter);
      });
    }

    const shootaPositions = [
      {
        x: this.gameConfig.worldSize.w * 0.5,
        y: this.gameConfig.worldSize.h * 0.2,
      },
      {
        x: this.gameConfig.worldSize.w * 0.5,
        y: this.gameConfig.worldSize.h * 0.8,
      },
    ];

    for (const shootaPosition of shootaPositions) {
      this.spawnInitialCopies(() => {
        const shoota = new Shoota(this.world.allocEntityId());
        shoota.x = shootaPosition.x;
        shoota.y = shootaPosition.y;
        this.world.spawn(shoota);
      });
    }

    this.spawnInitialCopies(() => {
      const megaknight = new Megaknight(this.world.allocEntityId());
      megaknight.x = this.gameConfig.worldSize.w * 0.5;
      megaknight.y = this.gameConfig.worldSize.h * 0.5;
      this.world.spawn(megaknight);
    });

    this.spawnInitialCopies(() => {
      const saboteur = new Saboteur(this.world.allocEntityId());
      saboteur.x = this.gameConfig.worldSize.w * 0.15;
      saboteur.y = this.gameConfig.worldSize.h * 0.15;
      this.world.spawn(saboteur);
    });
  }

  /**
   * Spawns a simple starter base cluster so building rendering and HUD state
   * have authoritative structures to display.
   */
  private spawnInitialBuildings(): void {
    const centerX = this.gameConfig.worldSize.w / 2;
    const centerY = this.gameConfig.worldSize.h / 2;
    const starterBuildings: Array<{
      x: number;
      y: number;
      create: (id: number) => Building;
    }> = [
      {
        x: centerX - 180,
        y: centerY - 120,
        create: (id) => new Wall(id, "North Wall"),
      },
      {
        x: centerX + 180,
        y: centerY - 120,
        create: (id) => new Wall(id, "East Wall"),
      },
      {
        x: centerX + 120,
        y: centerY + 130,
        create: (id) => new CraftingStation(id, "Craft Bench"),
      },
    ];

    for (const starterBuilding of starterBuildings) {
      this.spawnInitialCopies(() => {
        const building = starterBuilding.create(this.world.allocEntityId());
        building.x = starterBuilding.x;
        building.y = starterBuilding.y;
        this.world.spawn(building);
      });
    }
  }

  private spawnInitialCopies(spawn: () => void): void {
    for (
      let copyIndex = 0;
      copyIndex < this.gameConfig.debug.spawnMultiplier;
      copyIndex += 1
    ) {
      spawn();
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
        if (this.clientStateById.get(clientId) !== "ready") {
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
    const clientState = this.clientStateById.get(clientId) ?? "connected";
    if (clientState === "ready") {
      return;
    }

    if (clientState === "hello_pending") {
      return;
    }
    if (helloMessage.protocolVersion !== this.gameConfig.protocolVersion) {
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

import type { GameConfig } from "@shared/config/GameConfig.ts";
import type {
  ActionMessage,
  PoseMessage,
  ServerToClientMessage,
} from "@shared/net/protocol.ts";
import { ChatService } from "@server/chat/ChatService.ts";
import { Player } from "@server/entities/Player.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import {
  applyPlayerStarterLoadout,
  validatePlayerStarterLoadout,
} from "@server/server/starterLoadout.ts";
import { loadMap } from "@server/systems/MapLoader.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { World } from "@server/world/World.ts";

export class GameInstanceRuntime {
  public readonly world: World;
  public readonly snapshotManager: SnapshotManager;
  public readonly antiCheatValidator: AntiCheatValidator;
  public readonly chatService: ChatService;
  private readonly gameConfig: GameConfig;
  private readonly networkServer: NetworkServerLike;
  private readonly playerIdByClientId = new Map<string, number>();
  private readonly lastProcessedSequenceByClientId = new Map<string, number>();

  constructor(gameConfig: GameConfig, networkServer: NetworkServerLike) {
    validatePlayerStarterLoadout();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.world = new World(gameConfig);
    this.snapshotManager = new SnapshotManager();
    this.antiCheatValidator = new AntiCheatValidator();
    this.chatService = new ChatService({
      networkServer: this.networkServer,
      world: this.world,
      playerIdByClientId: this.playerIdByClientId,
    });

    this.world.waveSystem = WaveSystem.loadFromFile({
      dayNightSystem: this.world.dayNightSystem,
      configPath: "./apps/server/src/config/waves.json",
      chatService: this.chatService,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("Wave spawning system initialized");
    }

    loadMap(this.world);
  }

  public tick(): void {
    this.world.step();
    const drainedEvents = this.world.events.toArray();
    this.world.events.clear();
    this.snapshotManager.prepareTick(this.world, drainedEvents);

    for (const [clientId, playerId] of this.playerIdByClientId) {
      const snapshot = this.snapshotManager.makeSnapshotForPlayer(
        this.world,
        playerId,
        this.gameConfig.replication.interestRadius,
      );
      snapshot.lastProcessedSeq =
        this.lastProcessedSequenceByClientId.get(clientId) ?? -1;
      const snapshotMessage: ServerToClientMessage = {
        t: "snapshot",
        snapshot,
      };
      this.networkServer.send(clientId, JSON.stringify(snapshotMessage));
    }
  }

  public connectReadyClient(
    clientId: string,
    requestedPlayerName?: string,
  ): number {
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
    this.lastProcessedSequenceByClientId.set(clientId, -1);
    return playerId;
  }

  public detachClient(clientId: string): string | undefined {
    const playerName = this.getPlayer(clientId)?.name;
    this.lastProcessedSequenceByClientId.delete(clientId);
    const playerId = this.playerIdByClientId.get(clientId);
    if (playerId) {
      this.world.despawn(playerId);
      this.playerIdByClientId.delete(clientId);
    }
    return playerName;
  }

  public getPlayerName(clientId: string): string | undefined {
    return this.getPlayer(clientId)?.name;
  }

  public getPlayerCount(): number {
    return this.playerIdByClientId.size;
  }

  public handlePose(clientId: string, poseMessage: PoseMessage): void {
    const player = this.getPlayer(clientId);
    if (!player) {
      return;
    }

    const lastProcessedSeq =
      this.lastProcessedSequenceByClientId.get(clientId) ?? -1;
    if (poseMessage.seq <= lastProcessedSeq) {
      this.rejectInput(clientId, player, "stale_input", poseMessage);
      return;
    }

    if (!this.antiCheatValidator.validatePose(poseMessage, player)) {
      this.rejectInput(clientId, player, "invalid_input", poseMessage);
      return;
    }

    const sanitizedPose = this.sanitizePoseToWorldBounds(player, poseMessage);
    player.applyClientPose({
      seq: sanitizedPose.seq,
      clientTimeMs: sanitizedPose.clientTimeMs,
      x: sanitizedPose.x,
      y: sanitizedPose.y,
      theta: sanitizedPose.theta,
      heldMovement: sanitizedPose.heldMovement,
      receivedAtMs: Date.now(),
    });
    this.lastProcessedSequenceByClientId.set(clientId, poseMessage.seq);

    if (this.world.focusedTrace.matchesEntity(player)) {
      this.world.focusedTrace.recordEntityEvent(
        this.world,
        "pose_applied",
        player,
        {
          clientId,
          seq: poseMessage.seq,
          clientTimeMs: poseMessage.clientTimeMs,
          rawX: poseMessage.x,
          rawY: poseMessage.y,
          sanitizedX: sanitizedPose.x,
          sanitizedY: sanitizedPose.y,
          theta: sanitizedPose.theta,
          heldMovement: { ...poseMessage.heldMovement },
        },
      );
    }
  }

  public handleAction(clientId: string, actionMessage: ActionMessage): void {
    const player = this.getPlayer(clientId);
    if (!player) {
      return;
    }

    const lastProcessedSeq =
      this.lastProcessedSequenceByClientId.get(clientId) ?? -1;
    if (actionMessage.seq <= lastProcessedSeq) {
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
    this.lastProcessedSequenceByClientId.set(clientId, actionMessage.seq);

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
    const player = this.getPlayer(clientId);
    if (!player || player.alive) {
      return;
    }
    player.respawn(this.world);
  }

  public handleChat(clientId: string, text: string): void {
    this.chatService.handleChat(clientId, text);
  }

  private getPlayer(clientId: string): Player | undefined {
    const playerId = this.playerIdByClientId.get(clientId);
    if (!playerId) {
      return undefined;
    }
    return this.world.get<Player>(playerId);
  }

  private sanitizePoseToWorldBounds(
    player: Player,
    poseMessage: PoseMessage,
  ): PoseMessage {
    const bounds = player.getHitboxBounds();
    const minX = -bounds.minX;
    const maxX = Math.max(minX, this.gameConfig.worldSize.w - bounds.maxX);
    const minY = -bounds.minY;
    const maxY = Math.max(minY, this.gameConfig.worldSize.h - bounds.maxY);
    return {
      ...poseMessage,
      x: clamp(poseMessage.x, minX, maxX),
      y: clamp(poseMessage.y, minY, maxY),
    };
  }

  private rejectInput(
    clientId: string,
    player: Player,
    reason: "stale_input" | "invalid_input",
    payload: ActionMessage | PoseMessage,
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
          this.lastProcessedSequenceByClientId.get(clientId) ?? -1,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

import type { GameConfig } from "@shared/config/GameConfig.ts";
import type {
  ActionMessage,
  PoseMessage,
  ServerToClientMessage,
} from "@shared/net/protocol.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import { ChatService } from "@server/chat/ChatService.ts";
import { Player } from "@server/entities/Player.ts";
import { grantItemEntryByAcquisitionRules } from "@server/items/acquisition/granting.ts";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import {
  applyPlayerStarterLoadout,
  validatePlayerStarterLoadout,
} from "@server/server/starterLoadout.ts";
import { loadMap } from "@server/systems/MapLoader.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { World } from "@server/world/World.ts";

const POSE_DELTA_WARN_MULTIPLIER = 3.5;
const POSE_DELTA_WARN_MIN = 64;
const DEBUG_CREATIVE_STACK_COUNT = 9999;
const DEBUG_CREATIVE_ITEM_TYPE_IDS: readonly ResourceId[] = Object.freeze([
  makeResourceId("item", "wall"),
  makeResourceId("item", "chest"),
  makeResourceId("item", "cannon"),
  makeResourceId("item", "crafting_station"),
  makeResourceId("item", "structure_fence_h"),
  makeResourceId("item", "structure_fence_v"),
  makeResourceId("item", "structure_house_m"),
  makeResourceId("item", "structure_house_l"),
  makeResourceId("item", "structure_tent"),
  makeResourceId("item", "structure_tree"),
]);

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
    if (isDebugCreativeEditor(playerEntity)) {
      applyDebugCreativeLoadout(playerEntity);
    }

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
    this.warnOnSuspiciousPoseDelta(player, clientId, sanitizedPose);
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

  private warnOnSuspiciousPoseDelta(
    player: Player,
    clientId: string,
    poseMessage: PoseMessage,
  ): void {
    const delta = Math.hypot(
      poseMessage.x - player.x,
      poseMessage.y - player.y,
    );
    const warnThreshold = Math.max(
      POSE_DELTA_WARN_MIN,
      player.moveSpeed * POSE_DELTA_WARN_MULTIPLIER,
    );
    if (delta <= warnThreshold) {
      return;
    }

    console.warn(
      `[pose_warn] client=${clientId} player=${player.name} id=${player.id} delta=${delta.toFixed(
        2,
      )} threshold=${warnThreshold.toFixed(2)} seq=${poseMessage.seq}`,
    );

    if (this.world.focusedTrace.matchesEntity(player)) {
      this.world.focusedTrace.recordEntityEvent(
        this.world,
        "pose_delta_warn",
        player,
        {
          clientId,
          seq: poseMessage.seq,
          delta,
          threshold: warnThreshold,
          fromX: player.x,
          fromY: player.y,
          toX: poseMessage.x,
          toY: poseMessage.y,
        },
      );
    }
  }
}

function isDebugCreativeEditor(player: Player): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    player.name.toLowerCase() === "debug"
  );
}

function applyDebugCreativeLoadout(player: Player): void {
  player.inventory.resources.clear();
  for (let slotIndex = 0; slotIndex < player.inventory.hotbarSlots.length; slotIndex += 1) {
    player.inventory.hotbarSlots[slotIndex] = null;
  }
  player.inventory.setSelectedHotbarIndex(0);

  for (const itemTypeId of DEBUG_CREATIVE_ITEM_TYPE_IDS) {
    const itemEntry = itemTypeRegistry.get(itemTypeId);
    if (!itemEntry) {
      throw new Error(`Missing debug creative item entry: ${itemTypeId}`);
    }
    if (
      !grantItemEntryByAcquisitionRules(
        player.inventory,
        itemEntry,
        DEBUG_CREATIVE_STACK_COUNT,
      )
    ) {
      throw new Error(`Could not grant debug creative item ${itemTypeId}`);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

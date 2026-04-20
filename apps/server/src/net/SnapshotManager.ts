import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  EquippedItemSnapshot,
  InventorySlotSnapshot,
  InventorySnapshot,
  WeaponSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Serializes authoritative world state after each completed server tick.
 * This keeps snapshot construction concerns out of GameServer.
 */
export class SnapshotManager {
  private preparedTick = -1;
  private preparedEvents: readonly NetEvent[] = [];
  private preparedDayNight: WorldSnapshot["dayNight"] | null = null;
  private readonly snapshotByEntityId = new Map<number, EntitySnapshot>();
  private readonly previousSnapshotByEntityId = new Map<
    number,
    EntitySnapshot
  >();
  private readonly snapshotVersionByEntityId = new Map<number, number>();
  private readonly queryBuffer: Entity[] = [];
  private readonly includedEntityMarkers = new Map<number, number>();
  private marker = 0;
  private readonly eventBuffer: NetEvent[] = [];
  private readonly removedEntityIdsBuffer: number[] = [];
  private readonly knownEntityVersionsByPlayerId = new Map<
    number,
    Map<number, number>
  >();
  private readonly stalePlayerIds = new Set<number>();

  /**
   * Caches entity snapshots once per tick so per-client replication can reuse them.
   */
  public prepareTick(world: World, events: readonly NetEvent[]): void {
    this.preparedTick = world.tick;
    this.preparedEvents = events;
    this.preparedDayNight = world.dayNightSystem.toSnapshot();
    this.snapshotByEntityId.clear();

    for (const entity of world.entities.all()) {
      const snapshot = entity.toSnapshot() as EntitySnapshot;
      this.snapshotByEntityId.set(entity.id, snapshot);

      const previousSnapshot = this.previousSnapshotByEntityId.get(entity.id);
      const previousVersion =
        this.snapshotVersionByEntityId.get(entity.id) ?? 0;
      const nextVersion =
        previousSnapshot !== undefined &&
        areEntitySnapshotsEqual(previousSnapshot, snapshot)
          ? previousVersion
          : previousVersion + 1;

      this.snapshotVersionByEntityId.set(entity.id, nextVersion);
      this.previousSnapshotByEntityId.set(entity.id, snapshot);
    }

    this.removedEntityIdsBuffer.length = 0;
    for (const entityId of this.snapshotVersionByEntityId.keys()) {
      if (!this.snapshotByEntityId.has(entityId)) {
        this.removedEntityIdsBuffer.push(entityId);
      }
    }
    for (const removedEntityId of this.removedEntityIdsBuffer) {
      this.snapshotVersionByEntityId.delete(removedEntityId);
      this.previousSnapshotByEntityId.delete(removedEntityId);
    }

    for (const [playerId] of this.knownEntityVersionsByPlayerId) {
      if (!world.entities.has(playerId)) {
        this.stalePlayerIds.add(playerId);
      }
    }

    if (this.stalePlayerIds.size > 0) {
      for (const stalePlayerId of this.stalePlayerIds) {
        this.knownEntityVersionsByPlayerId.delete(stalePlayerId);
      }
      this.stalePlayerIds.clear();
    }
  }

  public makeSnapshotForPlayer(
    world: World,
    playerId: number,
    interestRadius: number,
  ): WorldSnapshot {
    if (this.preparedTick !== world.tick) {
      this.prepareTick(world, []);
    }

    const player = world.get<Player>(playerId);
    const dayNight = this.preparedDayNight ?? world.dayNightSystem.toSnapshot();
    if (!player) {
      this.knownEntityVersionsByPlayerId.delete(playerId);
      return {
        tick: world.tick,
        dayNight,
        full: true,
        entities: [],
        removedEntityIds: [],
        events: this.preparedEvents as NetEvent[],
      };
    }

    const minX = player.x - interestRadius;
    const minY = player.y - interestRadius;
    const maxX = player.x + interestRadius;
    const maxY = player.y + interestRadius;
    const knownEntityVersions = this.ensureKnownEntityVersionMap(playerId);
    const changedEntities: EntitySnapshot[] = [];
    const removedEntityIds: number[] = [];

    this.bumpMarker();
    this.recordVisibleEntityForPlayer(
      playerId,
      knownEntityVersions,
      changedEntities,
    );

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.queryBuffer,
    )) {
      if (this.isIncluded(entity.id)) {
        continue;
      }
      this.recordVisibleEntityForPlayer(
        entity.id,
        knownEntityVersions,
        changedEntities,
      );
    }

    for (const knownEntityId of knownEntityVersions.keys()) {
      if (this.isIncluded(knownEntityId)) {
        continue;
      }
      knownEntityVersions.delete(knownEntityId);
      removedEntityIds.push(knownEntityId);
    }

    const full =
      world.tick <= 2 ||
      removedEntityIds.length > MAX_DELTA_REMOVED_IDS ||
      changedEntities.length > MAX_DELTA_ENTITY_UPDATES;

    if (full) {
      const fullEntities = this.collectFullEntitiesForPlayer(
        world,
        playerId,
        minX,
        minY,
        maxX,
        maxY,
      );

      knownEntityVersions.clear();
      for (const entity of fullEntities) {
        knownEntityVersions.set(entity.id, this.getSnapshotVersion(entity.id));
      }

      return {
        tick: world.tick,
        dayNight,
        full: true,
        entities: fullEntities,
        removedEntityIds: [],
        events: this.getRelevantEventsForPlayer(
          player.x,
          player.y,
          playerId,
          interestRadius,
        ),
      };
    }

    const events = this.getRelevantEventsForPlayer(
      player.x,
      player.y,
      playerId,
      interestRadius,
    );

    return {
      tick: world.tick,
      dayNight,
      full: false,
      entities: changedEntities,
      removedEntityIds,
      events,
    };
  }

  private collectFullEntitiesForPlayer(
    world: World,
    playerId: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): EntitySnapshot[] {
    const entities: EntitySnapshot[] = [];
    this.bumpMarker();

    const playerSnapshot = this.snapshotByEntityId.get(playerId);
    if (playerSnapshot) {
      entities.push(playerSnapshot);
      this.markIncluded(playerId);
    }

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.queryBuffer,
    )) {
      if (this.isIncluded(entity.id)) {
        continue;
      }
      const snapshot = this.snapshotByEntityId.get(entity.id);
      if (!snapshot) {
        continue;
      }
      entities.push(snapshot);
      this.markIncluded(entity.id);
    }

    return entities;
  }

  private ensureKnownEntityVersionMap(playerId: number): Map<number, number> {
    let knownEntityVersions = this.knownEntityVersionsByPlayerId.get(playerId);
    if (!knownEntityVersions) {
      knownEntityVersions = new Map<number, number>();
      this.knownEntityVersionsByPlayerId.set(playerId, knownEntityVersions);
    }
    return knownEntityVersions;
  }

  private recordVisibleEntityForPlayer(
    entityId: number,
    knownEntityVersions: Map<number, number>,
    changedEntities: EntitySnapshot[],
  ): void {
    const snapshot = this.snapshotByEntityId.get(entityId);
    if (!snapshot) {
      return;
    }

    const snapshotVersion = this.getSnapshotVersion(entityId);
    const knownVersion = knownEntityVersions.get(entityId);
    if (knownVersion !== snapshotVersion) {
      changedEntities.push(snapshot);
    }

    knownEntityVersions.set(entityId, snapshotVersion);
    this.markIncluded(entityId);
  }

  private getSnapshotVersion(entityId: number): number {
    return this.snapshotVersionByEntityId.get(entityId) ?? 0;
  }

  private bumpMarker(): void {
    this.marker += 1;
    if (this.marker >= Number.MAX_SAFE_INTEGER) {
      this.marker = 1;
      this.includedEntityMarkers.clear();
    }
  }

  private markIncluded(entityId: number): void {
    this.includedEntityMarkers.set(entityId, this.marker);
  }

  private isIncluded(entityId: number): boolean {
    return this.includedEntityMarkers.get(entityId) === this.marker;
  }

  private getRelevantEventsForPlayer(
    playerX: number,
    playerY: number,
    playerId: number,
    interestRadius: number,
  ): NetEvent[] {
    if (this.preparedEvents.length === 0) {
      return EMPTY_EVENTS;
    }

    const eventRadius = interestRadius + EVENT_RELEVANCE_PADDING;
    const eventRadiusSquared = eventRadius * eventRadius;
    this.eventBuffer.length = 0;

    for (const event of this.preparedEvents) {
      if (
        isEventRelevantForPlayer(
          event,
          playerX,
          playerY,
          playerId,
          eventRadiusSquared,
        )
      ) {
        this.eventBuffer.push(event);
      }
    }

    if (this.eventBuffer.length === this.preparedEvents.length) {
      return this.preparedEvents as NetEvent[];
    }

    return [...this.eventBuffer];
  }
}

const EMPTY_EVENTS: NetEvent[] = [];
const EVENT_RELEVANCE_PADDING = 180;
const MAX_DELTA_REMOVED_IDS = 96;
const MAX_DELTA_ENTITY_UPDATES = 160;

function isEventRelevantForPlayer(
  event: NetEvent,
  playerX: number,
  playerY: number,
  playerId: number,
  eventRadiusSquared: number,
): boolean {
  if (event.type === "damage") {
    if (
      event.payload.targetId === playerId ||
      event.payload.sourceId === playerId
    ) {
      return true;
    }

    const deltaX = event.payload.x - playerX;
    const deltaY = event.payload.y - playerY;
    return deltaX * deltaX + deltaY * deltaY <= eventRadiusSquared;
  }

  if (event.payload.sourceId === playerId) {
    return true;
  }
  const deltaX = event.payload.x - playerX;
  const deltaY = event.payload.y - playerY;
  return deltaX * deltaX + deltaY * deltaY <= eventRadiusSquared;
}

function areEntitySnapshotsEqual(
  left: EntitySnapshot,
  right: EntitySnapshot,
): boolean {
  if (left === right) {
    return true;
  }

  if (
    left.id !== right.id ||
    left.kind !== right.kind ||
    left.typeId !== right.typeId ||
    left.x !== right.x ||
    left.y !== right.y ||
    left.vx !== right.vx ||
    left.vy !== right.vy ||
    left.rotation !== right.rotation ||
    left.hp !== right.hp ||
    left.maxHp !== right.maxHp ||
    left.alive !== right.alive ||
    left.ownerId !== right.ownerId ||
    !areHitboxSnapshotsEqual(left.hitboxes, right.hitboxes)
  ) {
    return false;
  }

  switch (left.kind) {
    case "player":
      return (
        right.kind === "player" &&
        left.name === right.name &&
        left.moveSpeed === right.moveSpeed &&
        areInventorySnapshotsEqual(left.inventory, right.inventory) &&
        areActiveEffectsEqual(left.activeEffects, right.activeEffects) &&
        areEquippedItemsEqual(left.equippedItem, right.equippedItem)
      );
    case "enemy":
      return (
        right.kind === "enemy" &&
        left.targetId === right.targetId &&
        areEquippedItemsEqual(left.equippedItem, right.equippedItem)
      );
    case "building":
      return (
        right.kind === "building" &&
        left.label === right.label &&
        left.tier === right.tier
      );
    case "pickup":
      return (
        right.kind === "pickup" &&
        areInventorySnapshotsEqual(left.inventory, right.inventory)
      );
    case "projectile":
      return right.kind === "projectile";
  }
}

function areHitboxSnapshotsEqual(
  left: readonly HitboxRect[],
  right: readonly HitboxRect[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftHitbox = left[index];
    const rightHitbox = right[index];
    if (
      !leftHitbox ||
      !rightHitbox ||
      leftHitbox.offsetX !== rightHitbox.offsetX ||
      leftHitbox.offsetY !== rightHitbox.offsetY ||
      leftHitbox.width !== rightHitbox.width ||
      leftHitbox.height !== rightHitbox.height
    ) {
      return false;
    }
  }

  return true;
}

function areInventorySnapshotsEqual(
  left: InventorySnapshot,
  right: InventorySnapshot,
): boolean {
  if (
    left.selectedHotbarIndex !== right.selectedHotbarIndex ||
    left.resources.length !== right.resources.length ||
    left.hotbarSlots.length !== right.hotbarSlots.length
  ) {
    return false;
  }

  for (let index = 0; index < left.resources.length; index += 1) {
    const leftResource = left.resources[index];
    const rightResource = right.resources[index];
    if (
      !leftResource ||
      !rightResource ||
      leftResource.typeId !== rightResource.typeId ||
      leftResource.amount !== rightResource.amount
    ) {
      return false;
    }
  }

  for (let index = 0; index < left.hotbarSlots.length; index += 1) {
    const leftSlot = left.hotbarSlots[index];
    const rightSlot = right.hotbarSlots[index];
    if (
      !leftSlot ||
      !rightSlot ||
      !areInventorySlotSnapshotsEqual(leftSlot, rightSlot)
    ) {
      return false;
    }
  }

  return true;
}

function areInventorySlotSnapshotsEqual(
  left: InventorySlotSnapshot,
  right: InventorySlotSnapshot,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "empty") {
    return true;
  }

  if (left.kind === "buildable" && right.kind === "buildable") {
    return left.typeId === right.typeId && left.count === right.count;
  }

  if (left.kind === "weapon" && right.kind === "weapon") {
    return areWeaponSnapshotsEqual(left, right);
  }

  return false;
}

function areWeaponSnapshotsEqual(
  left: WeaponSnapshot,
  right: WeaponSnapshot,
): boolean {
  return (
    left.typeId === right.typeId &&
    left.ownerId === right.ownerId &&
    left.cooldownTicksRemaining === right.cooldownTicksRemaining &&
    left.ammoInMag === right.ammoInMag &&
    left.magSize === right.magSize &&
    left.reserveMagCount === right.reserveMagCount &&
    left.reloadTicks === right.reloadTicks &&
    left.reloadTicksRemaining === right.reloadTicksRemaining
  );
}

function areActiveEffectsEqual(
  left: readonly ActiveEffectSnapshot[],
  right: readonly ActiveEffectSnapshot[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftEffect = left[index];
    const rightEffect = right[index];
    if (
      !leftEffect ||
      !rightEffect ||
      leftEffect.typeId !== rightEffect.typeId ||
      leftEffect.ticksRemaining !== rightEffect.ticksRemaining
    ) {
      return false;
    }
  }

  return true;
}

function areEquippedItemsEqual(
  left: EquippedItemSnapshot | undefined,
  right: EquippedItemSnapshot | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.typeId === right.typeId &&
    left.attackStyle === right.attackStyle &&
    left.cooldownTicksRemaining === right.cooldownTicksRemaining &&
    left.ammoInMag === right.ammoInMag &&
    left.magSize === right.magSize &&
    left.reserveMagCount === right.reserveMagCount &&
    left.reloadTicks === right.reloadTicks &&
    left.reloadTicksRemaining === right.reloadTicksRemaining
  );
}

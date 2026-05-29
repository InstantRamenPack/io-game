import { z } from "zod";
import { Building } from "@server/entities/Building.ts";
import { Crate } from "@server/entities/enemies/Crate.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const DAMAGEABLE_HOME_TOWER_TYPE_IDS = new Set<ResourceId>([
  "tower:hub" as ResourceId,
  "tower:energy" as ResourceId,
  "tower:comms" as ResourceId,
]);
import { ResourceIdSchema } from "@shared/validation/schemas.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { requireItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import { isSpawnableEntityCtor } from "@server/runtime/ctorGuards.ts";
import type { World } from "@server/world/World.ts";
import {
  generateProceduralWorldLayout,
  type ProceduralDungeonRoom,
  type ProceduralCrateLootSlot,
  type ProceduralLootSpec,
  type ProceduralSpawnSpec,
  type ProceduralWorldLayout,
} from "@shared/world/ProceduralWorld.ts";
import { isLegendaryBossTypeId } from "@shared/world/legendaryBoss.ts";
import {
  getExtractionLegendaryBossUnlockNightCycle,
  worldgenConfig,
} from "@shared/config/gameplayConfig.ts";

const StaticSpawnSchema = z.object({
  typeId: ResourceIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().optional(),
  rotation: z.number().finite().optional(),
  hitboxRects: z
    .array(
      z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        offsetX: z.number().finite(),
        offsetY: z.number().finite(),
      }),
    )
    .optional(),
});

const DungeonEntranceSchema = z.object({
  side: z.enum(["north", "south", "west", "east"]),
  tile: z.number().int().nonnegative(),
  widthTiles: z.number().int().positive().default(1),
});

const DungeonConfigSchema = z.object({
  originX: z.number().int().nonnegative(),
  originY: z.number().int().nonnegative(),
  widthTiles: z.number().int().positive(),
  heightTiles: z.number().int().positive(),
  seedOffset: z.number().int().default(0),
  algorithm: z.literal("bsp"),
  minLeafSizeTiles: z.number().int().positive().default(14),
  maxDepth: z.number().int().positive().default(4),
  minRoomSizeTiles: z.number().int().positive().default(6),
  maxRoomSizeTiles: z.number().int().positive().default(14),
  extraConnectionChance: z.number().min(0).max(1).default(0.2),
  entrances: z.array(DungeonEntranceSchema).default([]),
  roomTagPool: z.array(z.string().min(1)).default(["danger", "treasure"]),
});

const StaticZoneSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("static"),
  structures: z.array(StaticSpawnSchema).default([]),
  buildings: z.array(StaticSpawnSchema).default([]),
  enemies: z.array(StaticSpawnSchema).default([]),
});

const DungeonZoneSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("dungeon"),
  dungeon: DungeonConfigSchema,
});
z.object({
  seed: z.number().int().default(1337),
  tileSize: z.number().int().positive().default(worldgenConfig.tileSize),
  zones: z.array(
    z.discriminatedUnion("kind", [StaticZoneSchema, DungeonZoneSchema]),
  ),
});
type StaticSpawn = z.infer<typeof StaticSpawnSchema>;
function spawnMapEntity(world: World, spec: StaticSpawn): Entity {
  const entry = entityTypeRegistry.require(spec.typeId);
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error(`Map spawn type ${spec.typeId} is not spawnable.`);
  }

  const entity = new entry.ctor(world.allocEntityId());
  if (entry.kind === "structure" && !spec.hitboxRects) {
    entity.x = snapToTileCenter(spec.x);
    entity.y = snapToTileCenter(spec.y);
  } else {
    entity.x = spec.x;
    entity.y = spec.y;
  }
  entity.rotation = spec.rotation ?? 0;

  if (
    entity instanceof Building &&
    !DAMAGEABLE_HOME_TOWER_TYPE_IDS.has(entity.typeId)
  ) {
    entity.hp = 0;
    entity.maxHp = 0;
  }
  if (spec.hitboxRects) {
    entity.setHitboxProfileRects("default", spec.hitboxRects);
  }

  world.spawn(entity);
  return entity;
}

function snapToTileCenter(value: number): number {
  const tile = Math.floor(value / worldgenConfig.tileSize);
  return tile * worldgenConfig.tileSize + worldgenConfig.tileSize / 2;
}

function spawnProceduralEntity(
  world: World,
  spec: ProceduralSpawnSpec,
  spawnSource?: Enemy["spawnSource"],
): Entity {
  const entity = spawnMapEntity(world, spec);
  if (entity instanceof Enemy && spawnSource) {
    entity.spawnSource = spawnSource;
  }
  if (
    entity instanceof Crate &&
    wouldOverlapExistingStructureOrBuilding(world, entity)
  ) {
    world.despawn(entity.id);
    return entity;
  }
  if (entity instanceof Crate && spec.crateLoot) {
    fillCrate(entity, spec.crateLoot);
  }
  return entity;
}

function fillCrate(
  crate: Crate,
  lootSlots: readonly ProceduralCrateLootSlot[],
): void {
  for (const slot of lootSlots) {
    addLootSlotToInventory(crate.contents, slot);
  }
}

function addLootSlotToInventory(
  inventory: Inventory,
  slot: ProceduralCrateLootSlot,
): void {
  if (slot.kind === "stackable") {
    if (!inventory.addStackable(slot.typeId, slot.amount ?? 1)) {
      throw new Error(`Could not create procedural crate loot ${slot.typeId}.`);
    }
    return;
  }

  const itemEntry = requireItemLikeTypeEntry(slot.typeId);
  if (!inventory.grantItemCtor(itemEntry.ctor, slot.amount ?? 1)) {
    throw new Error(`Could not create procedural crate loot ${slot.typeId}.`);
  }
}

function spawnProceduralLootCrate(
  world: World,
  spec: ProceduralLootSpec,
): void {
  const entry = entityTypeRegistry.require("enemy:crate" as ResourceId);
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error("Procedural loot crate type is not spawnable.");
  }
  const entity = new entry.ctor(world.allocEntityId());
  entity.x = spec.x;
  entity.y = spec.y;
  if (wouldOverlapExistingStructureOrBuilding(world, entity)) {
    return;
  }
  world.spawn(entity);
  if (!(entity instanceof Crate)) {
    throw new Error("Procedural loot crate type did not create a crate.");
  }
  addLootSlotToInventory(entity.contents, spec);
}

function wouldOverlapExistingStructureOrBuilding(
  world: World,
  entity: Entity,
): boolean {
  const bounds = entity.getWorldBounds();
  const entityHitboxes = entity.getWorldHitboxes();
  for (const candidate of world.entities.all()) {
    if (candidate.id === entity.id) {
      continue;
    }
    const candidateKind = entityTypeRegistry.require(candidate.typeId).kind;
    if (
      candidateKind !== "structure" &&
      candidateKind !== "building" &&
      candidateKind !== "tower"
    ) {
      continue;
    }
    const candidateBounds = candidate.getWorldBounds();
    if (
      candidateBounds.maxX < bounds.minX ||
      candidateBounds.minX > bounds.maxX ||
      candidateBounds.maxY < bounds.minY ||
      candidateBounds.minY > bounds.maxY
    ) {
      continue;
    }
    if (
      doResolvedRectSetsOverlap(entityHitboxes, candidate.getWorldHitboxes())
    ) {
      return true;
    }
  }
  return false;
}

function loadProceduralLayout(
  world: World,
  layout: ProceduralWorldLayout,
): void {
  world.proceduralLayout = layout;
  world.gameConfig.worldSize = { ...layout.worldSize };

  for (const sector of layout.sectors) {
    for (const spec of sector.structures) {
      spawnProceduralEntity(world, spec);
    }
    for (const spec of sector.buildings) {
      spawnProceduralEntity(world, spec);
    }
    for (const spec of sector.enemies) {
      if (
        sector.archetype === "extraction" &&
        isLegendaryBossTypeId(spec.typeId)
      ) {
        world.deferredExtractionLegendaryBoss = spec;
        continue;
      }
      spawnProceduralEntity(world, spec, "layout");
    }
    for (const spec of sector.loot) {
      spawnProceduralLootCrate(world, spec);
    }
  }

  world.registerDungeonRooms(
    layout.dungeon.id,
    layout.dungeon.rooms.map(mapProceduralDungeonRoom),
  );
  world.initializeForestCampRespawns(layout.forestCamps);
}

function mapProceduralDungeonRoom(room: ProceduralDungeonRoom): {
  id: string;
  roomType: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    id: room.id,
    roomType: room.role,
    minX: room.minX,
    minY: room.minY,
    maxX: room.maxX,
    maxY: room.maxY,
  };
}

const cachedProceduralLayoutBySeed = new Map<
  number,
  ReturnType<typeof generateProceduralWorldLayout>
>();

function loadLobbyLayout(world: World): void {
  world.proceduralLayout = null;
  world.gameConfig.worldSize = { ...worldgenConfig.lobbyWorldSize };
  spawnMapEntity(world, {
    typeId: "tower:hub" as ResourceId,
    x: worldgenConfig.lobbyWorldSize.w / 2,
    y: worldgenConfig.lobbyWorldSize.h / 2 + 56,
  });
}

/**
 * Despawns all loot crates and re-spawns them from the stored procedural layout.
 * Called at dawn so each new day has fresh loot throughout the world.
 */
export function trySpawnDeferredExtractionLegendaryBoss(
  world: World,
  nightCycle: number,
): void {
  const deferred = world.deferredExtractionLegendaryBoss;
  if (!deferred) {
    return;
  }
  if (nightCycle < getExtractionLegendaryBossUnlockNightCycle()) {
    return;
  }
  spawnProceduralEntity(world, deferred);
  world.deferredExtractionLegendaryBoss = null;
}

export function refreshLoot(world: World): void {
  if (!world.proceduralLayout) return;

  for (const entity of world.entities.all()) {
    if (entity.typeId === ("enemy:crate" as ResourceId)) {
      world.despawn(entity.id);
    }
  }

  for (const sector of world.proceduralLayout.sectors) {
    for (const spec of sector.loot) {
      spawnProceduralLootCrate(world, spec);
    }
  }
}

/**
 * Respawns procedural layout enemies at dawn, mirroring crate refresh scope.
 */
export function refreshLayoutEnemies(world: World): void {
  if (!world.proceduralLayout) {
    return;
  }

  for (const entity of world.entities.all()) {
    if (entity instanceof Enemy && entity.spawnSource === "layout") {
      world.despawn(entity.id);
    }
  }

  for (const sector of world.proceduralLayout.sectors) {
    for (const spec of sector.enemies) {
      if (
        sector.archetype === "extraction" &&
        isLegendaryBossTypeId(spec.typeId)
      ) {
        continue;
      }
      spawnProceduralEntity(world, spec, "layout");
    }
  }
}

/**
 * Spawns all map structures and initial enemies from data-backed zones.
 */
export function loadMap(
  world: World,
  seed?: number,
  options: { kind?: "match" | "lobby" } = {},
): void {
  if (options.kind === "lobby") {
    loadLobbyLayout(world);
    return;
  }

  const layoutSeed = Number.isFinite(seed)
    ? Math.floor(seed as number) | 0
    : undefined;
  const cacheKey = layoutSeed ?? 1337;
  let layout = cachedProceduralLayoutBySeed.get(cacheKey);
  if (!layout) {
    layout = generateProceduralWorldLayout(cacheKey);
    cachedProceduralLayoutBySeed.set(cacheKey, layout);
  }
  loadProceduralLayout(world, layout);
}

import { z } from "zod";
import { Building } from "@server/entities/Building.ts";
import { Crate } from "@server/entities/enemies/Crate.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ResourceIdSchema } from "@shared/validation/schemas.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
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

const TILE_SIZE = 16;

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
  tileSize: z.number().int().positive().default(TILE_SIZE),
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

  if (entity instanceof Building) {
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
  const tile = Math.floor(value / TILE_SIZE);
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

function spawnProceduralEntity(
  world: World,
  spec: ProceduralSpawnSpec,
): Entity {
  const entity = spawnMapEntity(world, spec);
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
  const itemEntry = itemTypeRegistry.require(slot.typeId);
  if (!inventory.grantItemCtor(itemEntry.ctor, slot.amount ?? 1)) {
    throw new Error(`Could not create procedural crate loot ${slot.typeId}.`);
  }
}

function spawnProceduralLootCrate(
  world: World,
  spec: ProceduralLootSpec,
): void {
  const entity = spawnMapEntity(world, {
    typeId: "enemy:crate" as ResourceId,
    x: spec.x,
    y: spec.y,
  });
  if (!(entity instanceof Crate)) {
    throw new Error("Procedural loot crate type did not create a crate.");
  }
  addLootSlotToInventory(entity.contents, spec);
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
      spawnProceduralEntity(world, spec);
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

/**
 * Spawns all map structures and initial enemies from data-backed zones.
 */
export function loadMap(world: World, seed?: number): void {
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

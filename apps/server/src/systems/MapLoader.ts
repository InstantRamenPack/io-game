import seedrandom from "seedrandom";
import { z } from "zod";
import worldMapJson from "@server/config/world_map.json";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ResourceIdSchema } from "@shared/validation/schemas.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import { isSpawnableEntityCtor } from "@server/runtime/ctorGuards.ts";
import { grantItemEntryByAcquisitionRules } from "@server/items/acquisition/granting.ts";
import type { World } from "@server/world/World.ts";
import {
  generateProceduralWorldLayout,
  type ProceduralDungeonRoom,
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

const WorldMapSchema = z.object({
  seed: z.number().int().default(1337),
  tileSize: z.number().int().positive().default(TILE_SIZE),
  zones: z.array(
    z.discriminatedUnion("kind", [StaticZoneSchema, DungeonZoneSchema]),
  ),
});

type StaticSpawn = z.infer<typeof StaticSpawnSchema>;
type DungeonConfig = z.infer<typeof DungeonConfigSchema>;
type StaticZone = z.infer<typeof StaticZoneSchema>;
type WorldMapConfig = z.infer<typeof WorldMapSchema>;

type RoomRect = {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  roomType: string;
};

type LeafRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type TileRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function spawnMapEntity(world: World, spec: StaticSpawn): Entity {
  const entry = entityTypeRegistry.require(spec.typeId);
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error(`Map spawn type ${spec.typeId} is not spawnable.`);
  }

  const entity = new entry.ctor(world.allocEntityId());
  if (entry.kind === "structure") {
    entity.x = snapToTileCenter(spec.x);
    entity.y = snapToTileCenter(spec.y);
  } else {
    entity.x = spec.x;
    entity.y = spec.y;
  }

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

function tileRectCenter(
  worldOrigin: number,
  minTile: number,
  maxTile: number,
): number {
  return worldOrigin + ((minTile + maxTile + 1) * TILE_SIZE) / 2;
}

function createFilledTileGrid(
  widthTiles: number,
  heightTiles: number,
): Uint8Array {
  return new Uint8Array(widthTiles * heightTiles).fill(1);
}

function tileIndex(widthTiles: number, x: number, y: number): number {
  return y * widthTiles + x;
}

function clampTile(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function carveRect(
  tiles: Uint8Array,
  widthTiles: number,
  heightTiles: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const clampedMinX = clampTile(minX, 0, widthTiles - 1);
  const clampedMaxX = clampTile(maxX, 0, widthTiles - 1);
  const clampedMinY = clampTile(minY, 0, heightTiles - 1);
  const clampedMaxY = clampTile(maxY, 0, heightTiles - 1);
  for (let y = clampedMinY; y <= clampedMaxY; y += 1) {
    for (let x = clampedMinX; x <= clampedMaxX; x += 1) {
      tiles[tileIndex(widthTiles, x, y)] = 0;
    }
  }
}

function carveLine(
  tiles: Uint8Array,
  widthTiles: number,
  heightTiles: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  halfWidth = 1,
): void {
  let x = fromX;
  let y = fromY;

  while (x !== toX) {
    carveRect(
      tiles,
      widthTiles,
      heightTiles,
      x - halfWidth,
      y - halfWidth,
      x + halfWidth,
      y + halfWidth,
    );
    x += toX > x ? 1 : -1;
  }

  while (y !== toY) {
    carveRect(
      tiles,
      widthTiles,
      heightTiles,
      x - halfWidth,
      y - halfWidth,
      x + halfWidth,
      y + halfWidth,
    );
    y += toY > y ? 1 : -1;
  }

  carveRect(
    tiles,
    widthTiles,
    heightTiles,
    x - halfWidth,
    y - halfWidth,
    x + halfWidth,
    y + halfWidth,
  );
}

function splitLeafBsp(
  rng: seedrandom.PRNG,
  root: LeafRect,
  minLeafSizeTiles: number,
  maxDepth: number,
): LeafRect[] {
  const leaves: LeafRect[] = [];
  const stack: Array<{ leaf: LeafRect; depth: number }> = [
    { leaf: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const { leaf, depth } = current;
    const width = leaf.maxX - leaf.minX + 1;
    const height = leaf.maxY - leaf.minY + 1;

    const canSplitHoriz = height >= minLeafSizeTiles * 2;
    const canSplitVert = width >= minLeafSizeTiles * 2;

    if (depth >= maxDepth || (!canSplitHoriz && !canSplitVert)) {
      leaves.push(leaf);
      continue;
    }

    const splitVertical =
      canSplitVert && (!canSplitHoriz || width >= height)
        ? rng() >= 0.45
        : false;

    if (splitVertical && canSplitVert) {
      const splitMin = leaf.minX + minLeafSizeTiles;
      const splitMax = leaf.maxX - minLeafSizeTiles;
      const splitX = Math.floor(
        splitMin + rng() * Math.max(1, splitMax - splitMin + 1),
      );
      stack.push({
        depth: depth + 1,
        leaf: {
          minX: leaf.minX,
          maxX: splitX - 1,
          minY: leaf.minY,
          maxY: leaf.maxY,
        },
      });
      stack.push({
        depth: depth + 1,
        leaf: {
          minX: splitX,
          maxX: leaf.maxX,
          minY: leaf.minY,
          maxY: leaf.maxY,
        },
      });
      continue;
    }

    if (canSplitHoriz) {
      const splitMin = leaf.minY + minLeafSizeTiles;
      const splitMax = leaf.maxY - minLeafSizeTiles;
      const splitY = Math.floor(
        splitMin + rng() * Math.max(1, splitMax - splitMin + 1),
      );
      stack.push({
        depth: depth + 1,
        leaf: {
          minX: leaf.minX,
          maxX: leaf.maxX,
          minY: leaf.minY,
          maxY: splitY - 1,
        },
      });
      stack.push({
        depth: depth + 1,
        leaf: {
          minX: leaf.minX,
          maxX: leaf.maxX,
          minY: splitY,
          maxY: leaf.maxY,
        },
      });
      continue;
    }

    leaves.push(leaf);
  }

  return leaves;
}

function createRoomInLeaf(
  rng: seedrandom.PRNG,
  leaf: LeafRect,
  minRoomSizeTiles: number,
  maxRoomSizeTiles: number,
  roomId: number,
  roomTagPool: readonly string[],
): RoomRect | null {
  const leafWidth = leaf.maxX - leaf.minX + 1;
  const leafHeight = leaf.maxY - leaf.minY + 1;
  const maxRoomW = Math.min(maxRoomSizeTiles, leafWidth - 2);
  const maxRoomH = Math.min(maxRoomSizeTiles, leafHeight - 2);

  if (maxRoomW < minRoomSizeTiles || maxRoomH < minRoomSizeTiles) {
    return null;
  }

  const roomWidth = Math.floor(
    minRoomSizeTiles + rng() * (maxRoomW - minRoomSizeTiles + 1),
  );
  const roomHeight = Math.floor(
    minRoomSizeTiles + rng() * (maxRoomH - minRoomSizeTiles + 1),
  );

  const roomMinX = Math.floor(
    leaf.minX + 1 + rng() * Math.max(1, leafWidth - roomWidth - 1),
  );
  const roomMinY = Math.floor(
    leaf.minY + 1 + rng() * Math.max(1, leafHeight - roomHeight - 1),
  );
  const roomMaxX = roomMinX + roomWidth - 1;
  const roomMaxY = roomMinY + roomHeight - 1;

  const uniqueRoomTags = [...new Set(roomTagPool)];
  const roomType =
    uniqueRoomTags[roomId] ??
    roomTagPool[Math.floor(rng() * roomTagPool.length)] ??
    "danger";

  return {
    id: `room_${roomId}`,
    minX: roomMinX,
    minY: roomMinY,
    maxX: roomMaxX,
    maxY: roomMaxY,
    centerX: Math.floor((roomMinX + roomMaxX) / 2),
    centerY: Math.floor((roomMinY + roomMaxY) / 2),
    roomType,
  };
}

function carveEntrances(
  tiles: Uint8Array,
  widthTiles: number,
  heightTiles: number,
  entrances: readonly z.infer<typeof DungeonEntranceSchema>[],
): void {
  for (const entrance of entrances) {
    const width = Math.max(1, entrance.widthTiles);
    if (entrance.side === "west") {
      carveRect(
        tiles,
        widthTiles,
        heightTiles,
        0,
        entrance.tile,
        3,
        entrance.tile + width - 1,
      );
      continue;
    }
    if (entrance.side === "east") {
      carveRect(
        tiles,
        widthTiles,
        heightTiles,
        widthTiles - 4,
        entrance.tile,
        widthTiles - 1,
        entrance.tile + width - 1,
      );
      continue;
    }
    if (entrance.side === "north") {
      carveRect(
        tiles,
        widthTiles,
        heightTiles,
        entrance.tile,
        0,
        entrance.tile + width - 1,
        3,
      );
      continue;
    }
    carveRect(
      tiles,
      widthTiles,
      heightTiles,
      entrance.tile,
      heightTiles - 4,
      entrance.tile + width - 1,
      heightTiles - 1,
    );
  }
}

function extractSolidTileRects(
  tiles: Uint8Array,
  widthTiles: number,
  heightTiles: number,
): TileRect[] {
  const claimed = new Uint8Array(tiles.length);
  const rects: TileRect[] = [];

  for (let y = 0; y < heightTiles; y += 1) {
    for (let x = 0; x < widthTiles; x += 1) {
      const startIndex = tileIndex(widthTiles, x, y);
      if (tiles[startIndex] === 0 || claimed[startIndex] === 1) {
        continue;
      }

      let maxX = x;
      while (
        maxX + 1 < widthTiles &&
        tiles[tileIndex(widthTiles, maxX + 1, y)] === 1 &&
        claimed[tileIndex(widthTiles, maxX + 1, y)] === 0
      ) {
        maxX += 1;
      }

      let maxY = y;
      let canExtend = true;
      while (canExtend && maxY + 1 < heightTiles) {
        for (let scanX = x; scanX <= maxX; scanX += 1) {
          const scanIndex = tileIndex(widthTiles, scanX, maxY + 1);
          if (tiles[scanIndex] === 0 || claimed[scanIndex] === 1) {
            canExtend = false;
            break;
          }
        }
        if (canExtend) {
          maxY += 1;
        }
      }

      for (let claimY = y; claimY <= maxY; claimY += 1) {
        for (let claimX = x; claimX <= maxX; claimX += 1) {
          claimed[tileIndex(widthTiles, claimX, claimY)] = 1;
        }
      }

      rects.push({ minX: x, minY: y, maxX, maxY });
    }
  }

  return rects;
}

function spawnDungeonWallRect(
  world: World,
  zone: DungeonConfig,
  rect: TileRect,
): void {
  const entry = entityTypeRegistry.require(
    "structure:dungeon_wall" as ResourceId,
  );
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error("Dungeon wall type is not spawnable.");
  }

  const entity = new entry.ctor(world.allocEntityId());
  entity.x = tileRectCenter(zone.originX, rect.minX, rect.maxX);
  entity.y = tileRectCenter(zone.originY, rect.minY, rect.maxY);
  entity.setHitboxProfileRects("default", [
    {
      width: (rect.maxX - rect.minX + 1) * TILE_SIZE,
      height: (rect.maxY - rect.minY + 1) * TILE_SIZE,
      offsetX: 0,
      offsetY: 0,
    },
  ]);
  world.spawn(entity);
}

function spawnDungeonZone(
  world: World,
  zoneId: string,
  zone: DungeonConfig,
  mapSeed: number,
): void {
  const rng = seedrandom(`${mapSeed}:${zoneId}:${zone.seedOffset}`);
  const tiles = createFilledTileGrid(zone.widthTiles, zone.heightTiles);
  const rootLeaf: LeafRect = {
    minX: 1,
    minY: 1,
    maxX: zone.widthTiles - 2,
    maxY: zone.heightTiles - 2,
  };
  const leaves = splitLeafBsp(
    rng,
    rootLeaf,
    zone.minLeafSizeTiles,
    zone.maxDepth,
  );

  const rooms: RoomRect[] = [];
  let roomCounter = 0;
  for (const leaf of leaves) {
    const room = createRoomInLeaf(
      rng,
      leaf,
      zone.minRoomSizeTiles,
      zone.maxRoomSizeTiles,
      roomCounter,
      zone.roomTagPool,
    );
    if (!room) {
      continue;
    }
    roomCounter += 1;
    rooms.push(room);
    carveRect(
      tiles,
      zone.widthTiles,
      zone.heightTiles,
      room.minX,
      room.minY,
      room.maxX,
      room.maxY,
    );
  }

  const sortedRooms = [...rooms].sort((left, right) => {
    if (left.centerX !== right.centerX) {
      return left.centerX - right.centerX;
    }
    return left.centerY - right.centerY;
  });

  for (let index = 1; index < sortedRooms.length; index += 1) {
    const previous = sortedRooms[index - 1];
    const next = sortedRooms[index];
    if (!previous || !next) {
      continue;
    }
    carveLine(
      tiles,
      zone.widthTiles,
      zone.heightTiles,
      previous.centerX,
      previous.centerY,
      next.centerX,
      next.centerY,
      1,
    );

    if (rng() <= zone.extraConnectionChance) {
      const randomRoom = sortedRooms[Math.floor(rng() * sortedRooms.length)];
      if (randomRoom) {
        carveLine(
          tiles,
          zone.widthTiles,
          zone.heightTiles,
          next.centerX,
          next.centerY,
          randomRoom.centerX,
          randomRoom.centerY,
          1,
        );
      }
    }
  }

  carveEntrances(tiles, zone.widthTiles, zone.heightTiles, zone.entrances);

  for (const rect of extractSolidTileRects(
    tiles,
    zone.widthTiles,
    zone.heightTiles,
  )) {
    spawnDungeonWallRect(world, zone, rect);
  }

  world.registerDungeonRooms(
    zoneId,
    rooms.map((room) => ({
      id: room.id,
      roomType: room.roomType,
      minX: zone.originX + room.minX * TILE_SIZE,
      minY: zone.originY + room.minY * TILE_SIZE,
      maxX: zone.originX + (room.maxX + 1) * TILE_SIZE,
      maxY: zone.originY + (room.maxY + 1) * TILE_SIZE,
    })),
  );
}

function loadStaticZone(world: World, zone: StaticZone): void {
  for (const spec of zone.structures) {
    if (!spec.typeId.startsWith("structure:")) {
      throw new Error(
        `Static zone ${zone.id} contains non-structure map blocker ${spec.typeId}.`,
      );
    }
    spawnMapEntity(world, spec);
  }
  for (const spec of zone.buildings) {
    spawnMapEntity(world, spec);
  }
  for (const spec of zone.enemies) {
    spawnMapEntity(world, spec);
  }
}

function spawnProceduralEntity(
  world: World,
  spec: ProceduralSpawnSpec,
): Entity {
  return spawnMapEntity(world, spec);
}

function spawnProceduralLoot(world: World, spec: ProceduralLootSpec): void {
  const itemEntry = itemTypeRegistry.require(spec.typeId);
  const inventory = new Inventory();
  if (
    !grantItemEntryByAcquisitionRules(inventory, itemEntry, spec.amount ?? 1)
  ) {
    throw new Error(`Could not create procedural loot ${spec.typeId}.`);
  }

  const pickup = new ItemEntity(world.allocEntityId(), inventory);
  pickup.x = spec.x;
  pickup.y = spec.y;
  world.spawn(pickup);
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
      spawnProceduralLoot(world, spec);
    }
  }

  world.registerDungeonRooms(
    layout.dungeon.id,
    layout.dungeon.rooms.map(mapProceduralDungeonRoom),
  );
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

let cachedProceduralLayout: ReturnType<
  typeof generateProceduralWorldLayout
> | null = null;

/**
 * Spawns all map structures and initial enemies from data-backed zones.
 */
export function loadMap(world: World): void {
  if (!cachedProceduralLayout) {
    cachedProceduralLayout = generateProceduralWorldLayout();
  }
  loadProceduralLayout(world, cachedProceduralLayout);
}

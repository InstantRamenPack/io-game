<<<<<<< HEAD
import { BuildingL } from "@server/entities/buildings/BuildingL.ts";
import { BuildingM } from "@server/entities/buildings/BuildingM.ts";
import { BuildingXl } from "@server/entities/buildings/BuildingXl.ts";
import { FenceH } from "@server/entities/buildings/FenceH.ts";
import { FenceV } from "@server/entities/buildings/FenceV.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { Tent } from "@server/entities/buildings/Tent.ts";
import { Tree } from "@server/entities/buildings/Tree.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import type { Building } from "@server/entities/Building.ts";
import type { World } from "@server/world/World.ts";

type BuildingSpec =
  | { type: "xl"; x: number; y: number; label: string }
  | { type: "l"; x: number; y: number; label: string }
  | { type: "m"; x: number; y: number; label: string }
  | { type: "fence_h"; x: number; y: number }
  | { type: "fence_v"; x: number; y: number }
  | { type: "recycler"; x: number; y: number }
  | { type: "tent"; x: number; y: number }
  | { type: "tree"; x: number; y: number };
=======
import seedrandom from "seedrandom";
import { z } from "zod";
import worldMapJson from "@server/config/world_map.json";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ResourceIdSchema } from "@shared/validation/schemas.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { isSpawnableEntityCtor } from "@server/runtime/ctorGuards.ts";
import type { World } from "@server/world/World.ts";

const TILE_SIZE = 16;
>>>>>>> 483153507c54c96d22704d318cb6bf71301f5ef0

const StaticSpawnSchema = z.object({
  typeId: ResourceIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().optional(),
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

<<<<<<< HEAD
  // Control booth (moved left to clear fence_v at x=1750)
  { type: "m", x: 1400, y: 3600, label: "Control Booth" },
];

// No enemies at extraction zone (safe area)

// ---------------------------------------------------------------------------
// Abandoned Village  (zone: x 3200-6500, y 250-2500)
// ---------------------------------------------------------------------------
const VILLAGE_STRUCTURES: BuildingSpec[] = [
  { type: "recycler", x: 5000, y: 1700 },

  { type: "m", x: 3600, y: 650, label: "House" },
  { type: "m", x: 4050, y: 900, label: "House" },
  { type: "m", x: 3700, y: 1400, label: "House" },
  { type: "l", x: 3550, y: 2000, label: "Farm" },
  { type: "m", x: 4800, y: 700, label: "Blacksmith" },
  { type: "m", x: 5400, y: 1100, label: "Clinic" },
  // Extra buildings in bottom corners of village
  { type: "m", x: 4100, y: 2300, label: "House" },
  { type: "l", x: 5800, y: 2000, label: "Warehouse" },
  // Scattered fence fragments (ruined village feel) — shifted clear of buildings
  { type: "fence_h", x: 3900, y: 1200 },
  { type: "fence_v", x: 4300, y: 1600 },
  { type: "fence_h", x: 5200, y: 1300 },
];

const VILLAGE_ENEMIES: EnemySpec[] = [
  { kind: "drifter", x: 4200, y: 1300 },
  { kind: "drifter", x: 3900, y: 700 },
  { kind: "drifter", x: 5000, y: 1500 },
];

// ---------------------------------------------------------------------------
// Outpost  (zone: x 3200-6100, y 4800-6700)
// ---------------------------------------------------------------------------
const OUTPOST_STRUCTURES: BuildingSpec[] = [
  { type: "recycler", x: 5000, y: 5400 },

  { type: "tent", x: 3550, y: 5200 },
  { type: "tent", x: 3900, y: 5550 },
  { type: "tent", x: 4300, y: 5100 },
  { type: "tent", x: 4700, y: 5500 },
  { type: "tent", x: 5100, y: 5200 },
  { type: "tent", x: 5500, y: 5600 },
  { type: "tent", x: 5800, y: 5050 },
  { type: "tent", x: 6000, y: 5450 },
  { type: "m", x: 4750, y: 5900, label: "Watchtower" },
  { type: "m", x: 4300, y: 5900, label: "Supply Cache" },
  // Fence fragments (ruined perimeter)
  { type: "fence_h", x: 3700, y: 4950 },
  { type: "fence_h", x: 4900, y: 4950 },
  { type: "fence_v", x: 3300, y: 5500 },
  { type: "fence_v", x: 6200, y: 5300 },
];

const OUTPOST_ENEMIES: EnemySpec[] = [
  { kind: "drifter", x: 4000, y: 5350 },
  { kind: "drifter", x: 4600, y: 5200 },
  { kind: "drifter", x: 5300, y: 5700 },
  { kind: "drifter", x: 5700, y: 5200 },
  { kind: "shoota", x: 4800, y: 6100 },
  { kind: "shoota", x: 5200, y: 5500 },
  { kind: "shoota", x: 3800, y: 5800 },
];

// ---------------------------------------------------------------------------
// Forest  (zone: x 7000-9800, y 200-6800)
// 75 trees in clusters leaving navigable corridors
// ---------------------------------------------------------------------------
const FOREST_TREES: { x: number; y: number }[] = [
  // Top cluster
  { x: 7150, y: 420 },
  { x: 7400, y: 620 },
  { x: 7700, y: 470 },
  { x: 7950, y: 720 },
  { x: 8200, y: 420 },
  { x: 8500, y: 680 },
  { x: 7300, y: 920 },
  { x: 7650, y: 1100 },
  { x: 7900, y: 960 },
  { x: 8150, y: 1200 },
  { x: 8450, y: 870 },
  { x: 9050, y: 530 },
  { x: 9300, y: 820 },
  { x: 9580, y: 440 },
  { x: 9200, y: 1120 },
  { x: 7100, y: 1450 },
  { x: 7450, y: 1620 },
  { x: 7800, y: 1480 },
  { x: 8100, y: 1720 },
  { x: 8500, y: 1380 },
  { x: 9480, y: 1540 },

  // Mid cluster
  { x: 7200, y: 2420 },
  { x: 7520, y: 2720 },
  { x: 7900, y: 2520 },
  { x: 8230, y: 2820 },
  { x: 8620, y: 2430 },
  { x: 9120, y: 2620 },
  { x: 9420, y: 2920 },
  { x: 9680, y: 2540 },
  { x: 7120, y: 3220 },
  { x: 7460, y: 3420 },
  { x: 7760, y: 3120 },
  { x: 8020, y: 3520 },
  { x: 8420, y: 3230 },
  { x: 8780, y: 3580 },
  { x: 9220, y: 3320 },
  { x: 9520, y: 3720 },
  { x: 7330, y: 3920 },
  { x: 7720, y: 4120 },
  { x: 8120, y: 3830 },
  { x: 8520, y: 4230 },
  { x: 8920, y: 3940 },
  { x: 9150, y: 4320 },
  { x: 9620, y: 4130 },
  { x: 7630, y: 4520 },
  { x: 8320, y: 4620 },
  { x: 9030, y: 4530 },
  { x: 8720, y: 4830 },
  { x: 7430, y: 4940 },
  { x: 9230, y: 4730 },
  { x: 7130, y: 4230 },

  // Bottom cluster
  { x: 7220, y: 5130 },
  { x: 7620, y: 5330 },
  { x: 8020, y: 5030 },
  { x: 8430, y: 5430 },
  { x: 8830, y: 5130 },
  { x: 9330, y: 5230 },
  { x: 9630, y: 5630 },
  { x: 7320, y: 5830 },
  { x: 7730, y: 6030 },
  { x: 8130, y: 5730 },
  { x: 8530, y: 6130 },
  { x: 8930, y: 5830 },
  { x: 9230, y: 6030 },
  { x: 9520, y: 6430 },
  { x: 7130, y: 6250 },
  { x: 7530, y: 6530 },
  { x: 8230, y: 6330 },
  { x: 8730, y: 6630 },
  { x: 9130, y: 6430 },
  { x: 7930, y: 6630 },
  { x: 9680, y: 5930 },
];


function spawnBuilding(world: World, spec: BuildingSpec): void {
  const id = world.allocEntityId();
  let building: Building;

  switch (spec.type) {
    case "xl": {
      const b = new BuildingXl(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "l": {
      const b = new BuildingL(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "m": {
      const b = new BuildingM(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "fence_h":
      building = new FenceH(id);
      break;
    case "fence_v":
      building = new FenceV(id);
      break;
    case "recycler":
      building = new Recycler(id);
      break;
    case "tent":
      building = new Tent(id);
      break;
    case "tree":
      building = new Tree(id);
      break;
=======
function spawnMapEntity(world: World, spec: StaticSpawn): Entity {
  const entry = entityTypeRegistry.require(spec.typeId);
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error(`Map spawn type ${spec.typeId} is not spawnable.`);
>>>>>>> 483153507c54c96d22704d318cb6bf71301f5ef0
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
  for (const spec of zone.enemies) {
    spawnMapEntity(world, spec);
  }
}

/**
 * Spawns all map structures and initial enemies from data-backed zones.
 */
// Recycler at player spawn (world center, open land between village and outpost)
const SPAWN_STRUCTURES: BuildingSpec[] = [
  { type: "recycler", x: 5000, y: 3500 },
];

export function loadMap(world: World): void {
<<<<<<< HEAD
  for (const spec of SPAWN_STRUCTURES) {
    spawnBuilding(world, spec);
  }
  for (const spec of MILITARY_STRUCTURES) {
    spawnBuilding(world, spec);
=======
  const parsed = WorldMapSchema.parse(worldMapJson) as WorldMapConfig;
  if (parsed.tileSize !== TILE_SIZE) {
    throw new Error(
      `Unsupported world_map tileSize=${parsed.tileSize}. Expected ${TILE_SIZE}.`,
    );
>>>>>>> 483153507c54c96d22704d318cb6bf71301f5ef0
  }

  for (const zone of parsed.zones) {
    if (zone.kind === "static") {
      loadStaticZone(world, zone);
      continue;
    }

    spawnDungeonZone(world, zone.id, zone.dungeon, parsed.seed);
  }
}

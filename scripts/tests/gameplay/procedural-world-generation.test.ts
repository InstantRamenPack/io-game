import { beforeAll, describe, expect, test } from "bun:test";
import {
  PROCEDURAL_GRID_SIZE,
  PROCEDURAL_TILE_SIZE,
  PROCEDURAL_WORLD_SIZE,
  REQUIRED_DUNGEON_ROOM_ROLES,
  generateProceduralWorldLayout,
  pointInRect,
} from "@shared/world/ProceduralWorld.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import { getPlayerSpawnPosition } from "@server/entities/playerSpawn.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

const ACCESS_SAMPLE_SIZE = 32;
const PLAYER_CLEARANCE = 24;
const MIN_REACHABLE_OPEN_RATIO = 0.97;

describe("procedural survival extraction world", () => {
  beforeAll(bootstrapTestRegistries);

  test("generates a deterministic larger 3x3 macro-sector layout", () => {
    const first = generateProceduralWorldLayout(1337);
    const second = generateProceduralWorldLayout(1337);

    expect(first).toEqual(second);
    expect(first.worldSize).toEqual(PROCEDURAL_WORLD_SIZE);
    expect(first.worldSize.w).toBeGreaterThan(10000);
    expect(first.worldSize.h).toBeGreaterThan(7000);
    expect(first.sectors).toHaveLength(
      PROCEDURAL_GRID_SIZE * PROCEDURAL_GRID_SIZE,
    );
    expect(new Set(first.sectors.map((sector) => sector.id)).size).toBe(9);
  });

  test("varies meaningful sector assignment across seeds while preserving required roles", () => {
    const first = generateProceduralWorldLayout(1337);
    const second = generateProceduralWorldLayout(1338);

    expect(first.extractionSectorId).not.toBe(second.extractionSectorId);
    for (const layout of [first, second]) {
      expect(layout.centerSectorId).toBe("sector_1_1");
      expect(
        layout.sectors.find((sector) => sector.id === "sector_1_1")?.archetype,
      ).toBe("home");
      expect(
        layout.sectors.find((sector) => sector.id === layout.extractionSectorId)
          ?.archetype,
      ).toBe("extraction");
      expect(
        layout.sectors.find((sector) => sector.id === layout.dungeonSectorId)
          ?.archetype,
      ).toBe("dungeon");
      expect(
        layout.sectors.find((sector) => sector.id === layout.militarySectorId)
          ?.archetype,
      ).toBe("military");
      expect(
        layout.sectors.find((sector) => sector.id === layout.forestSectorId)
          ?.archetype,
      ).toBe("forest");
      expect(isCornerSector(layout.extractionSectorId)).toBe(true);
      expect(isCornerSector(layout.dungeonSectorId)).toBe(true);
      expect(isEdgeSector(layout.militarySectorId)).toBe(true);
      expect(isEdgeSector(layout.forestSectorId)).toBe(true);
    }
  });

  test("every sector has content, traversal, rewards, enemies where hostile, and minimap metadata", () => {
    const layout = generateProceduralWorldLayout(1337);

    for (const sector of layout.sectors) {
      expect(sector.traversalConnections.length).toBeGreaterThan(0);
      expect(
        sector.structures.length + sector.buildings.length,
      ).toBeGreaterThan(0);
      expect(sector.loot.length).toBeGreaterThan(0);
      expect(sector.features.length).toBeGreaterThan(0);
      expect(sector.features.some((feature) => feature.hasReward)).toBe(true);
      expect(sector.features.some((feature) => feature.risk !== "low")).toBe(
        true,
      );
      expect(sector.minimapMarkers.length).toBeGreaterThanOrEqual(2);
      expect(sector.landmark.label.length).toBeGreaterThan(0);
      if (sector.archetype !== "home") {
        expect(sector.enemies.length).toBeGreaterThan(0);
        expect(sector.hasLightsOut).toBe(true);
        expect(sector.allowsFastBuildingDecay).toBe(true);
      } else {
        expect(sector.hasLightsOut).toBe(false);
        expect(sector.allowsFastBuildingDecay).toBe(false);
      }
    }
  });

  test("home center area has no procedural structure blockers", () => {
    const layout = generateProceduralWorldLayout(1337);
    const home = layout.sectors.find((sector) => sector.archetype === "home");
    expect(home).toBeDefined();
    if (!home) {
      throw new Error("expected home sector");
    }

    expect(home.structures).toHaveLength(0);
    expect(home.buildings.length).toBeGreaterThanOrEqual(3);
    for (const spec of [...home.structures, ...home.buildings]) {
      expect(pointInRect(spec, layout.homeBounds)).toBe(true);
    }
  });

  test("dungeon contains all required room roles with role-specific content", () => {
    const layout = generateProceduralWorldLayout(1337);
    const roles = new Set(layout.dungeon.rooms.map((room) => room.role));

    for (const role of REQUIRED_DUNGEON_ROOM_ROLES) {
      expect(roles.has(role)).toBe(true);
    }
    const dungeonSector = layout.sectors.find(
      (sector) => sector.archetype === "dungeon",
    );
    expect(layout.dungeon.rooms.length).toBeGreaterThanOrEqual(9);
    expect(layout.dungeon.rooms.length).toBeLessThanOrEqual(12);
    expect(layout.dungeon.entrances).toHaveLength(2);
    expect(
      new Set(layout.dungeon.entrances.map((entrance) => entrance.side)),
    ).toEqual(new Set(expectedDungeonEntranceSides(layout.dungeonSectorId)));
    const dungeonSectorBounds = layout.sectors.find(
      (sector) => sector.id === layout.dungeonSectorId,
    )!;
    expect(layout.dungeon.minX).toBe(dungeonSectorBounds.minX);
    expect(layout.dungeon.minY).toBe(dungeonSectorBounds.minY);
    expect(layout.dungeon.maxX).toBe(dungeonSectorBounds.maxX);
    expect(layout.dungeon.maxY).toBe(dungeonSectorBounds.maxY);
    expect(layout.dungeon.wallHitboxRects.length).toBeGreaterThan(10);
    expect(layout.dungeon.wallHitboxRects.length).toBeLessThan(200);
    expect(
      dungeonSector?.structures.filter(
        (spec) => spec.typeId === "structure:dungeon",
      ),
    ).toHaveLength(1);
    expect(
      dungeonSector?.structures.filter(
        (spec) => spec.typeId === "structure:dungeon_wall",
      ).length,
    ).toBe(0);
    expect(dungeonSector?.enemies.length).toBeGreaterThanOrEqual(10);
    expect(entityTypeIds(dungeonSector!)).toContain("enemy:thanos");
    expect(entityTypeIds(dungeonSector!)).not.toEqual(
      expect.arrayContaining([
        "enemy:bomber",
        "enemy:wallbreaker",
        "enemy:saboteur",
      ]),
    );
    expect(
      dungeonSector?.buildings.some(
        (building) => building.typeId === "building:tripwire",
      ),
    ).toBe(true);
    expect(
      dungeonSector?.buildings.some(
        (building) => building.typeId === "building:dungeon_door",
      ),
    ).toBe(true);
    expect(dungeonRoomDoorRoles(layout)).toEqual(["treasure", "boss"]);
    expect(dungeonKeyLootByRoomRole(layout)).toEqual({ mini_boss: 2 });
    expect(totalDungeonKeys(layout)).toBeGreaterThanOrEqual(
      layout.dungeon.doors.length,
    );
    expect(
      dungeonSector?.enemies.some(
        (enemy) =>
          enemy.typeId === "enemy:crate" &&
          enemy.crateLoot?.some((slot) => slot.typeId === "item:sniper"),
      ),
    ).toBe(true);
    expect(
      dungeonSector?.loot.some((loot) => loot.typeId === "item:dungeon_key"),
    ).toBe(true);
  });

  test("dungeon chamber centers are reachable from the two entrances when doors are unlockable", () => {
    const layout = generateProceduralWorldLayout(1337);
    const reachability = computeDungeonReachability(layout);

    for (const entrance of layout.dungeon.entrances) {
      expect(reachability.isReachable(entrance)).toBe(true);
    }
    for (const room of layout.dungeon.rooms) {
      expect(
        reachability.isReachable({ x: room.centerX, y: room.centerY }),
        `${room.id} should be reachable from a dungeon entrance`,
      ).toBe(true);
      expect(room.maxX - room.minX).toBeGreaterThanOrEqual(630);
      expect(room.maxY - room.minY).toBeGreaterThanOrEqual(630);
    }
  });

  test("military, forest, extraction, and residential POIs expose required feature roles", () => {
    const layout = generateProceduralWorldLayout(1337);
    const military = layout.sectors.find(
      (sector) => sector.archetype === "military",
    )!;
    expect(entityTypeIds(military)).toEqual(
      expect.arrayContaining(["enemy:commander", "enemy:sniper"]),
    );
    expect(featureRoles(military)).toEqual(
      expect.arrayContaining([
        "checkpoint",
        "barracks",
        "command_center",
        "armory_vault",
        "motor_pool",
        "comms",
        "training_yard",
        "watch_tower",
      ]),
    );

    const forest = layout.sectors.find(
      (sector) => sector.archetype === "forest",
    )!;
    expect(entityTypeIds(forest)).toEqual(
      expect.arrayContaining(["enemy:stalker"]),
    );
    expect(featureRoles(forest)).toEqual(
      expect.arrayContaining([
        "trail",
        "cabin",
        "camp",
        "pond",
        "bridge",
        "shrine",
        "hidden_cache",
        "predator_clearing",
      ]),
    );

    const extraction = layout.sectors.find(
      (sector) => sector.archetype === "extraction",
    )!;
    expect(entityTypeIds(extraction)).toEqual(
      expect.arrayContaining(["enemy:commander", "enemy:sniper"]),
    );
    expect(featureRoles(extraction)).toEqual(
      expect.arrayContaining(["helipad", "approach_route", "danger_perimeter"]),
    );

    const residentialLike = layout.sectors.filter((sector) =>
      [
        "ruined_town",
        "abandoned_suburb",
        "roadside_village",
        "wreckage_field",
        "farmstead",
      ].includes(sector.archetype),
    );
    expect(residentialLike.length).toBeGreaterThan(0);
    for (const sector of residentialLike) {
      expect(featureRoles(sector)).toEqual(
        expect.arrayContaining(["residential_block", "ruin_cluster"]),
      );
    }
  });

  test("all generated entity and loot references use known resource families", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      for (const spec of [
        ...sector.structures,
        ...sector.buildings,
        ...sector.enemies,
      ]) {
        expect(/^(structure|building|enemy):/.test(spec.typeId)).toBe(true);
      }
      for (const loot of sector.loot) {
        expect(loot.typeId.startsWith("item:")).toBe(true);
        expect(loot.amount ?? 1).toBeGreaterThan(0);
      }
    }
  });

  test("all generated entity and loot references resolve through registries", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      for (const spec of [
        ...sector.structures,
        ...sector.buildings,
        ...sector.enemies,
      ]) {
        expect(entityTypeRegistry.get(spec.typeId)).toBeDefined();
      }
      for (const loot of sector.loot) {
        expect(itemTypeRegistry.get(loot.typeId)).toBeDefined();
      }
    }
  });

  test("procedurally placed static structures and buildings do not overlap", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      const blockers = [...sector.structures, ...sector.buildings].map(
        (spec) => ({
          spec,
          hitboxes: resolveProceduralSpawnHitboxes(spec),
        }),
      );
      for (let leftIndex = 0; leftIndex < blockers.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < blockers.length;
          rightIndex += 1
        ) {
          const left = blockers[leftIndex]!;
          const right = blockers[rightIndex]!;
          expect(
            doResolvedRectSetsOverlap(left.hitboxes, right.hitboxes),
            `${sector.id}: ${left.spec.typeId}@${left.spec.x},${left.spec.y} overlaps ${right.spec.typeId}@${right.spec.x},${right.spec.y}`,
          ).toBe(false);
        }
      }
    }
  });

  test("loaded runtime contains the procedural sectors, minimap data, dungeon rooms, and extraction marker", () => {
    const { runtime } = makeRuntime();
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    expect(layout.sectors).toHaveLength(9);
    expect(
      layout.minimapMarkers.some(
        (marker) => marker.id === "extraction_helipad",
      ),
    ).toBe(true);
    expect(
      runtime.world.dungeonRoomsByZone.get(layout.dungeon.id)?.length,
    ).toBe(REQUIRED_DUNGEON_ROOM_ROLES.length);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId.startsWith("enemy:")).length,
    ).toBeGreaterThan(60);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId === "pickup:item_entity").length,
    ).toBe(0);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId === "enemy:crate").length,
    ).toBeGreaterThan(25);
  });

  test("loaded procedural geometry leaves spawn clear and nearly all unoccupied sample cells reachable", () => {
    const { runtime } = makeRuntime();
    const world = runtime.world;
    const layout = world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }

    const reachability = computeOpenAreaReachability(world);
    expect(reachability.startOccupied).toBe(false);
    expect(reachability.openCells).toBeGreaterThan(10_000);
    expect(reachability.reachableRatio).toBeGreaterThanOrEqual(
      MIN_REACHABLE_OPEN_RATIO,
    );

    world.ensureSpatialIndex();
    world.navPathService.updateDirty(world);
    const spawn = getPlayerSpawnPosition(world.gameConfig.worldSize);
    const unreachableMajorFeatures = layout.sectors.flatMap((sector) =>
      sector.features
        .filter(
          (feature) =>
            feature.risk !== "low" &&
            sector.archetype !== "dungeon" &&
            !feature.role.startsWith("dungeon_") &&
            !reachability.isOccupied(feature.center),
        )
        .filter(
          (feature) =>
            !world.navPathService.getNextWaypoint(
              spawn.x,
              spawn.y,
              feature.center.x,
              feature.center.y,
            ),
        )
        .map((feature) => `${sector.id}:${feature.id}`),
    );
    expect(unreachableMajorFeatures).toEqual([]);
  });
});

function isCornerSector(id: string): boolean {
  return ["sector_0_0", "sector_0_2", "sector_2_0", "sector_2_2"].includes(id);
}

function isEdgeSector(id: string): boolean {
  return ["sector_0_1", "sector_1_0", "sector_1_2", "sector_2_1"].includes(id);
}

type DungeonEntranceSide = "north" | "south" | "west" | "east";

function expectedDungeonEntranceSides(id: string): DungeonEntranceSide[] {
  switch (id) {
    case "sector_0_0":
      return ["east", "south"];
    case "sector_0_2":
      return ["west", "south"];
    case "sector_2_0":
      return ["east", "north"];
    case "sector_2_2":
      return ["west", "north"];
    default:
      throw new Error(`Expected a corner dungeon sector, got ${id}`);
  }
}

function featureRoles(
  sector: ReturnType<typeof generateProceduralWorldLayout>["sectors"][number],
): string[] {
  return sector.features.map((feature) => feature.role);
}

function entityTypeIds(
  sector: ReturnType<typeof generateProceduralWorldLayout>["sectors"][number],
): string[] {
  return sector.enemies.map((enemy) => enemy.typeId);
}

function dungeonRoomDoorRoles(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): string[] {
  return layout.dungeon.doors.map((door) => {
    const room = layout.dungeon.rooms.find((candidate) =>
      pointOnRoomPerimeter(door, candidate),
    );
    if (!room) {
      throw new Error(`Expected dungeon door at ${door.x},${door.y} on a room`);
    }
    return room.role;
  });
}

function dungeonKeyLootByRoomRole(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): Record<string, number> {
  const dungeonSector = layout.sectors.find(
    (sector) => sector.id === layout.dungeonSectorId,
  );
  if (!dungeonSector) {
    throw new Error("expected dungeon sector");
  }
  const keysByRole: Record<string, number> = {};
  for (const loot of dungeonSector.loot) {
    if (loot.typeId !== "item:dungeon_key") {
      continue;
    }
    const room = layout.dungeon.rooms.find((candidate) =>
      pointInRect(loot, candidate),
    );
    if (!room) {
      throw new Error(`Expected dungeon key at ${loot.x},${loot.y} in a room`);
    }
    keysByRole[room.role] = (keysByRole[room.role] ?? 0) + (loot.amount ?? 1);
  }
  return keysByRole;
}

function totalDungeonKeys(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): number {
  let total = 0;
  for (const amount of Object.values(dungeonKeyLootByRoomRole(layout))) {
    total += amount ?? 0;
  }
  return total;
}

function pointOnRoomPerimeter(
  point: WorldPoint,
  room: ReturnType<
    typeof generateProceduralWorldLayout
  >["dungeon"]["rooms"][number],
): boolean {
  const tolerance = PROCEDURAL_TILE_SIZE;
  const onVerticalDoor =
    Math.abs(point.x - room.minX) <= tolerance ||
    Math.abs(point.x - room.maxX) <= tolerance;
  const onHorizontalDoor =
    Math.abs(point.y - room.minY) <= tolerance ||
    Math.abs(point.y - room.maxY) <= tolerance;
  return (
    (onVerticalDoor && point.y >= room.minY && point.y <= room.maxY) ||
    (onHorizontalDoor && point.x >= room.minX && point.x <= room.maxX)
  );
}

function resolveProceduralSpawnHitboxes(
  spec: ReturnType<
    typeof generateProceduralWorldLayout
  >["sectors"][number]["structures"][number],
) {
  if (spec.hitboxRects) {
    return resolveHitboxRects(spec.x, spec.y, spec.hitboxRects);
  }
  const content = getEntityContent(spec.typeId);
  const hitboxProfiles = content?.hitboxProfiles;
  expect(hitboxProfiles).toBeDefined();
  if (!hitboxProfiles) {
    throw new Error(`Missing hitbox profile for ${spec.typeId}`);
  }
  const activeProfile =
    (content.activeHitboxProfile &&
      hitboxProfiles[content.activeHitboxProfile]) ??
    Object.values(hitboxProfiles)[0];
  expect(activeProfile).toBeDefined();
  if (!activeProfile) {
    throw new Error(`Missing active hitbox profile for ${spec.typeId}`);
  }
  return resolveHitboxRects(spec.x, spec.y, activeProfile);
}

type WorldPoint = { x: number; y: number };

type RuntimeReachability = {
  startOccupied: boolean;
  openCells: number;
  reachableCells: number;
  reachableRatio: number;
  isOccupied(point: WorldPoint): boolean;
};

type DungeonReachability = {
  isReachable(point: WorldPoint): boolean;
};

function computeDungeonReachability(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): DungeonReachability {
  const cellSize = ACCESS_SAMPLE_SIZE;
  const dungeon = layout.dungeon;
  const minCol = Math.floor(dungeon.minX / cellSize);
  const minRow = Math.floor(dungeon.minY / cellSize);
  const cols = Math.ceil((dungeon.maxX - dungeon.minX) / cellSize);
  const rows = Math.ceil((dungeon.maxY - dungeon.minY) / cellSize);
  const blockers = collectProceduralDungeonWallBlockers(layout);
  const occupied = new Uint8Array(cols * rows);
  const reachable = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point = cellCenter(minCol + col, minRow + row, cellSize);
      if (pointBlocked(point, blockers)) {
        occupied[cellIndex(cols, col, row)] = 1;
      }
    }
  }

  const queue: number[] = [];
  for (const entrance of dungeon.entrances) {
    const start = pointInsideDungeonFromEntrance(entrance);
    const startCol = clampIndex(Math.floor(start.x / cellSize) - minCol, cols);
    const startRow = clampIndex(Math.floor(start.y / cellSize) - minRow, rows);
    const startIndex = cellIndex(cols, startCol, startRow);
    if (occupied[startIndex] === 0 && reachable[startIndex] === 0) {
      reachable[startIndex] = 1;
      queue.push(startIndex);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const col = current % cols;
    const row = Math.floor(current / cols);
    visitNeighbor(col + 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col - 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row + 1, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row - 1, cols, rows, occupied, reachable, queue);
  }

  return {
    isReachable(point: WorldPoint) {
      const col = clampIndex(Math.floor(point.x / cellSize) - minCol, cols);
      const row = clampIndex(Math.floor(point.y / cellSize) - minRow, rows);
      return reachable[cellIndex(cols, col, row)] === 1;
    },
  };
}

function collectProceduralDungeonWallBlockers(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): Array<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> {
  const dungeonSector = layout.sectors.find(
    (sector) => sector.id === layout.dungeonSectorId,
  );
  if (!dungeonSector) {
    throw new Error("expected dungeon sector");
  }
  return dungeonSector.structures.flatMap((spec) =>
    resolveProceduralSpawnHitboxes(spec).map((rect) => ({
      minX: rect.minX,
      minY: rect.minY,
      maxX: rect.maxX,
      maxY: rect.maxY,
    })),
  );
}

function pointInsideDungeonFromEntrance(
  entrance: ReturnType<
    typeof generateProceduralWorldLayout
  >["dungeon"]["entrances"][number],
): WorldPoint {
  const offset = 128;
  switch (entrance.side) {
    case "north":
      return { x: entrance.x, y: entrance.y + offset };
    case "south":
      return { x: entrance.x, y: entrance.y - offset };
    case "west":
      return { x: entrance.x + offset, y: entrance.y };
    case "east":
      return { x: entrance.x - offset, y: entrance.y };
  }
}

function computeOpenAreaReachability(world: World): RuntimeReachability {
  const cellSize = ACCESS_SAMPLE_SIZE;
  const cols = Math.floor(world.gameConfig.worldSize.w / cellSize);
  const rows = Math.floor(world.gameConfig.worldSize.h / cellSize);
  const blockers = collectExpandedStaticBlockers(world);
  const occupied = new Uint8Array(cols * rows);
  const reachable = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point = cellCenter(col, row, cellSize);
      if (pointBlocked(point, blockers)) {
        occupied[cellIndex(cols, col, row)] = 1;
      }
    }
  }

  const spawn = getPlayerSpawnPosition(world.gameConfig.worldSize);
  const startCol = clampIndex(Math.floor(spawn.x / cellSize), cols);
  const startRow = clampIndex(Math.floor(spawn.y / cellSize), rows);
  const startIndex = cellIndex(cols, startCol, startRow);
  const startOccupied = occupied[startIndex] === 1;
  const queue: number[] = [];
  if (!startOccupied) {
    reachable[startIndex] = 1;
    queue.push(startIndex);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const col = current % cols;
    const row = Math.floor(current / cols);
    visitNeighbor(col + 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col - 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row + 1, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row - 1, cols, rows, occupied, reachable, queue);
  }

  let openCells = 0;
  let reachableCells = 0;
  for (let index = 0; index < occupied.length; index += 1) {
    if (occupied[index] === 1) {
      continue;
    }
    openCells += 1;
    if (reachable[index] === 1) {
      reachableCells += 1;
    }
  }

  return {
    startOccupied,
    openCells,
    reachableCells,
    reachableRatio: openCells === 0 ? 0 : reachableCells / openCells,
    isOccupied(point: WorldPoint) {
      return pointBlocked(point, blockers);
    },
  };
}

function collectExpandedStaticBlockers(world: World): Array<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> {
  const blockers: Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }> = [];

  for (const entity of world.entities.all()) {
    if (!isProceduralStaticBlocker(entity)) {
      continue;
    }
    for (const rect of resolveHitboxRects(
      entity.x,
      entity.y,
      entity.hitboxes,
    )) {
      blockers.push({
        minX: rect.minX - PLAYER_CLEARANCE,
        minY: rect.minY - PLAYER_CLEARANCE,
        maxX: rect.maxX + PLAYER_CLEARANCE,
        maxY: rect.maxY + PLAYER_CLEARANCE,
      });
    }
  }
  return blockers;
}

function isProceduralStaticBlocker(entity: Entity): boolean {
  if (entity.collisionMode === "none") {
    return false;
  }
  const kind = entityTypeRegistry.require(entity.typeId).kind;
  return kind === "structure" || kind === "building";
}

function pointBlocked(
  point: WorldPoint,
  blockers: ReadonlyArray<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>,
): boolean {
  return blockers.some(
    (blocker) =>
      point.x >= blocker.minX &&
      point.x <= blocker.maxX &&
      point.y >= blocker.minY &&
      point.y <= blocker.maxY,
  );
}

function visitNeighbor(
  col: number,
  row: number,
  cols: number,
  rows: number,
  occupied: Uint8Array,
  reachable: Uint8Array,
  queue: number[],
): void {
  if (col < 0 || row < 0 || col >= cols || row >= rows) {
    return;
  }
  const index = cellIndex(cols, col, row);
  if (occupied[index] === 1 || reachable[index] === 1) {
    return;
  }
  reachable[index] = 1;
  queue.push(index);
}

function cellCenter(col: number, row: number, cellSize: number): WorldPoint {
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

function cellIndex(cols: number, col: number, row: number): number {
  return row * cols + col;
}

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

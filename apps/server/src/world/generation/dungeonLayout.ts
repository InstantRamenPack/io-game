import seedrandom from "seedrandom";
import type {
  DungeonRoomRole,
  ProceduralDungeonEntrance,
  ProceduralDungeonPlan,
  ProceduralDungeonRoom,
  ProceduralPoint,
  ProceduralRect,
  ProceduralSpawnSpec,
} from "@shared/world/layoutTypes.ts";
import {
  PROCEDURAL_GRID_SIZE,
  pointInRect,
} from "@shared/world/layoutTypes.ts";
import {
  splitRectAlongAxis,
  snap,
  snapEdge,
  distanceSquared,
  rectsOverlap,
} from "@server/world/generation/layoutGeometry.ts";
const DUNGEON_FILL_CELL_SIZE = 32;
const DUNGEON_HALLWAY_WIDTH = 96;
export function createDungeonPlan(
  seed: number,
  sector: ProceduralRect,
  row: number,
  col: number,
): ProceduralDungeonPlan {
  const rng = seedrandom(`${seed}:dungeon:${row}:${col}`);
  const minX = snapEdge(sector.minX);
  const minY = snapEdge(sector.minY);
  const maxX = snapEdge(sector.maxX);
  const maxY = snapEdge(sector.maxY);
  const entranceSides: ProceduralDungeonEntrance["side"][] = [];
  if (row === 0) {
    entranceSides.push("south");
  } else if (row === PROCEDURAL_GRID_SIZE - 1) {
    entranceSides.push("north");
  }
  if (col === 0) {
    entranceSides.push("east");
  } else if (col === PROCEDURAL_GRID_SIZE - 1) {
    entranceSides.push("west");
  }
  if (entranceSides.length !== 2) {
    throw new Error("Dungeon must occupy a corner sector.");
  }

  const entrances = entranceSides.map((side) =>
    makeDungeonEntrance(side, minX, minY, maxX, maxY),
  );
  const wallThickness = 64;
  const roomLayouts = createBspDungeonRoomLayouts(
    rng,
    {
      minX: minX + wallThickness + 96,
      minY: minY + wallThickness + 96,
      maxX: maxX - wallThickness - 96,
      maxY: maxY - wallThickness - 96,
    },
    16 + Math.floor(rng() * 5),
  );
  const rooms = assignDungeonRoomRoles(roomLayouts, entrances);
  const centerX = snap((minX + maxX) / 2);
  const centerY = snap((minY + maxY) / 2);
  const hallways = createDungeonHallways(rooms, entrances, rng);
  const wallRects = [
    ...createDungeonFilledStructureHitboxes(
      { minX, minY, maxX, maxY },
      rooms,
      hallways,
      centerX,
      centerY,
    ),
  ];
  return {
    id: "dungeon_alpha",
    minX,
    minY,
    maxX,
    maxY,
    rooms,
    hallways,
    entrances,
    wallHitboxRects: wallRects,
  };
}

function makeDungeonEntrance(
  side: ProceduralDungeonEntrance["side"],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): ProceduralDungeonEntrance {
  const centerX = snap((minX + maxX) / 2);
  const centerY = snap((minY + maxY) / 2);
  switch (side) {
    case "north":
      return { side, x: centerX, y: minY };
    case "south":
      return { side, x: centerX, y: maxY };
    case "west":
      return { side, x: minX, y: centerY };
    case "east":
      return { side, x: maxX, y: centerY };
  }
}

type DungeonBspLeaf = ProceduralRect;
type DungeonRoomLayout = ProceduralRect & {
  centerX: number;
  centerY: number;
};

function createBspDungeonRoomLayouts(
  rng: seedrandom.PRNG,
  bounds: ProceduralRect,
  targetRoomCount: number,
): DungeonRoomLayout[] {
  const leaves: DungeonBspLeaf[] = [bounds];
  const minLeafSize = 704;

  while (leaves.length < targetRoomCount) {
    const splitIndex = findDungeonLeafSplitCandidate(leaves, minLeafSize, rng);
    if (splitIndex < 0) {
      break;
    }
    const leaf = leaves.splice(splitIndex, 1)[0]!;
    const width = leaf.maxX - leaf.minX;
    const height = leaf.maxY - leaf.minY;
    const splitVertical =
      width > height * 1.2 ? true : height > width * 1.2 ? false : rng() > 0.5;
    const splitRatios = [0.34, 0.42, 0.5, 0.58, 0.66];
    const splitRatio = splitRatios[Math.floor(rng() * splitRatios.length)]!;
    const splitGap = snapEdge(32 + Math.floor(rng() * 3) * 16);
    leaves.push(
      ...splitRectAlongAxis(leaf, splitVertical, splitRatio, splitGap),
    );
  }

  const orderedLeaves = [...leaves].sort((left, right) => {
    const leftScore = left.minY + left.minX * 0.05;
    const rightScore = right.minY + right.minX * 0.05;
    return leftScore - rightScore;
  });
  return orderedLeaves.map((leaf) => {
    const inset = 48;
    const fullMinX = snapEdge(leaf.minX + inset);
    const fullMinY = snapEdge(leaf.minY + inset);
    const fullMaxX = snapEdge(leaf.maxX - inset);
    const fullMaxY = snapEdge(leaf.maxY - inset);
    const centerX = snap((fullMinX + fullMaxX) / 2);
    const centerY = snap((fullMinY + fullMaxY) / 2);
    const halfWidth = snapEdge((fullMaxX - fullMinX) / 4);
    const halfHeight = snapEdge((fullMaxY - fullMinY) / 4);
    const minX = snapEdge(centerX - halfWidth);
    const minY = snapEdge(centerY - halfHeight);
    const maxX = snapEdge(centerX + halfWidth);
    const maxY = snapEdge(centerY + halfHeight);
    return {
      minX,
      minY,
      maxX,
      maxY,
      centerX,
      centerY,
    };
  });
}

function findDungeonLeafSplitCandidate(
  leaves: readonly DungeonBspLeaf[],
  minLeafSize: number,
  rng: seedrandom.PRNG,
): number {
  const candidates: Array<{ index: number; area: number }> = [];
  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index]!;
    const width = leaf.maxX - leaf.minX;
    const height = leaf.maxY - leaf.minY;
    if (Math.max(width, height) < minLeafSize * 1.65) {
      continue;
    }
    candidates.push({ index, area: width * height });
  }
  if (candidates.length === 0) {
    return -1;
  }
  candidates.sort((left, right) => right.area - left.area);
  const optionCount = Math.min(4, candidates.length);
  return candidates[Math.floor(rng() * optionCount)]!.index;
}

function assignDungeonRoomRoles(
  layouts: readonly DungeonRoomLayout[],
  entrances: readonly ProceduralDungeonEntrance[],
): ProceduralDungeonRoom[] {
  const shallowRoles: DungeonRoomRole[] = [
    "entrance",
    "combat",
    "trap",
    "enemy_swarm",
  ];
  const middleRoles: DungeonRoomRole[] = [
    "maze",
    "combat",
    "trap",
    "enemy_swarm",
    "armory",
  ];
  const deepRoles: DungeonRoomRole[] = [
    "armory",
    "combat",
    "enemy_swarm",
    "trap",
  ];

  const depthOrdered = [...layouts].sort((left, right) => {
    const leftDepth = dungeonRoomEntranceDepth(left, entrances);
    const rightDepth = dungeonRoomEntranceDepth(right, entrances);
    return leftDepth - rightDepth;
  });
  const rolesByLayout = new Map<DungeonRoomLayout, DungeonRoomRole>();

  for (let index = 0; index < depthOrdered.length; index += 1) {
    const layout = depthOrdered[index]!;
    const progress =
      depthOrdered.length <= 1 ? 1 : index / (depthOrdered.length - 1);
    const pool =
      progress >= 0.75
        ? deepRoles
        : progress >= 0.35
          ? middleRoles
          : shallowRoles;
    rolesByLayout.set(layout, pool[index % pool.length]!);
  }

  const requiredByDepth: DungeonRoomRole[] = [
    "entrance",
    "combat",
    "enemy_swarm",
    "maze",
    "trap",
    "armory",
    "mini_boss",
    "treasure",
    "boss",
  ];
  for (let index = 0; index < requiredByDepth.length; index += 1) {
    const depthIndex = Math.floor(
      (index / (requiredByDepth.length - 1)) * (depthOrdered.length - 1),
    );
    rolesByLayout.set(depthOrdered[depthIndex]!, requiredByDepth[index]!);
  }

  const rooms = layouts.map((layout, index) => {
    const role = rolesByLayout.get(layout) ?? "combat";
    return {
      id: `dungeon_${role}_${index}`,
      role,
      minX:
        role === "boss"
          ? layout.centerX - (layout.maxX - layout.minX)
          : layout.minX,
      minY:
        role === "boss"
          ? layout.centerY - (layout.maxY - layout.minY)
          : layout.minY,
      maxX:
        role === "boss"
          ? layout.centerX + (layout.maxX - layout.minX)
          : layout.maxX,
      maxY:
        role === "boss"
          ? layout.centerY + (layout.maxY - layout.minY)
          : layout.maxY,
      centerX: layout.centerX,
      centerY: layout.centerY,
    };
  });
  ensureExactlyOneBossRoom(rooms, entrances);
  return rooms;
}

function ensureExactlyOneBossRoom(
  rooms: ProceduralDungeonRoom[],
  entrances: readonly ProceduralDungeonEntrance[],
): void {
  const bossRooms = rooms.filter((room) => room.role === "boss");
  if (bossRooms.length === 1) {
    return;
  }

  const deepest = [...rooms].sort(
    (left, right) =>
      dungeonRoomEntranceDepth(right, entrances) -
      dungeonRoomEntranceDepth(left, entrances),
  )[0]!;
  for (const room of rooms) {
    if (room.role === "boss" && room.id !== deepest.id) {
      room.role = "combat";
    }
  }
  deepest.role = "boss";

  if (rooms.filter((room) => room.role === "boss").length !== 1) {
    throw new Error("Failed to assign exactly one dungeon boss room.");
  }
}

function dungeonRoomEntranceDepth(
  room: DungeonRoomLayout,
  entrances: readonly ProceduralDungeonEntrance[],
): number {
  return Math.min(
    ...entrances.map((entrance) =>
      distanceSquared(room.centerX, room.centerY, entrance.x, entrance.y),
    ),
  );
}

function createDungeonHallways(
  rooms: readonly ProceduralDungeonRoom[],
  entrances: readonly ProceduralDungeonEntrance[],
  rng: seedrandom.PRNG,
): ProceduralRect[] {
  const hallways: ProceduralRect[] = [];
  const depthOrderedRooms = [...rooms].sort(
    (left, right) =>
      dungeonRoomEntranceDepth(left, entrances) -
      dungeonRoomEntranceDepth(right, entrances),
  );
  const layerCount = 5;
  const layers: ProceduralDungeonRoom[][] = Array.from(
    { length: layerCount },
    () => [],
  );
  for (let index = 0; index < depthOrderedRooms.length; index += 1) {
    const layerIndex = Math.min(
      layerCount - 1,
      Math.floor((index / depthOrderedRooms.length) * layerCount),
    );
    layers[layerIndex]!.push(depthOrderedRooms[index]!);
  }

  const addHallwayBetweenPoints = (
    from: ProceduralPoint,
    to: ProceduralPoint,
    allowedRooms: readonly ProceduralDungeonRoom[],
  ): boolean => {
    const turns =
      rng() > 0.5
        ? [
            { x: snap(from.x), y: snap(to.y) },
            { x: snap(to.x), y: snap(from.y) },
          ]
        : [
            { x: snap(to.x), y: snap(from.y) },
            { x: snap(from.x), y: snap(to.y) },
          ];
    for (const turn of turns) {
      const rects = [
        makeDungeonHallwayRect(from, turn),
        makeDungeonHallwayRect(turn, to),
      ];
      if (hallwayRectsOnlyTouchRooms(rects, allowedRooms, rooms)) {
        hallways.push(...rects);
        return true;
      }
    }
    return false;
  };
  const addHallwayBetweenRooms = (
    fromRoom: ProceduralDungeonRoom,
    toRoom: ProceduralDungeonRoom,
  ) => {
    return addHallwayBetweenPoints(
      roomEdgePointToward(fromRoom, {
        x: toRoom.centerX,
        y: toRoom.centerY,
      }),
      roomEdgePointToward(toRoom, {
        x: fromRoom.centerX,
        y: fromRoom.centerY,
      }),
      [fromRoom, toRoom],
    );
  };

  const nearestRoomTo = (point: ProceduralPoint) =>
    rooms.reduce((nearest, room) => {
      const nearestDistance = distanceSquared(
        point.x,
        point.y,
        nearest.centerX,
        nearest.centerY,
      );
      const roomDistance = distanceSquared(
        point.x,
        point.y,
        room.centerX,
        room.centerY,
      );
      return roomDistance < nearestDistance ? room : nearest;
    }, rooms[0]!);

  for (const entrance of entrances) {
    let connectedRooms = 0;
    for (const targetRoom of nearestRoomsTo(
      entrance,
      layers[0]!,
      layers[0]!.length,
    )) {
      if (
        addHallwayBetweenPoints(
          entrance,
          roomEdgePointToward(targetRoom, entrance),
          [targetRoom],
        )
      ) {
        connectedRooms += 1;
      }
      if (connectedRooms >= 2) {
        break;
      }
    }
    if (connectedRooms === 0) {
      const targetRoom = nearestRoomTo(entrance);
      addHallwayBetweenPoints(
        entrance,
        roomEdgePointToward(targetRoom, entrance),
        [targetRoom],
      );
    }
  }

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const currentLayer = layers[layerIndex]!;
    const previousOptions = layers
      .slice(Math.max(0, layerIndex - 2), layerIndex)
      .flat();
    for (let index = 0; index < currentLayer.length; index += 1) {
      const room = currentLayer[index]!;
      const parentOptions =
        previousOptions.length > 0
          ? nearestRoomsTo(
              { x: room.centerX, y: room.centerY },
              previousOptions,
              previousOptions.length,
            )
          : nearestRoomsTo(
              { x: room.centerX, y: room.centerY },
              currentLayer.slice(0, index),
              currentLayer.slice(0, index).length,
            );
      let connectedParents = 0;
      for (const parent of parentOptions) {
        if (addHallwayBetweenRooms(parent, room)) {
          connectedParents += 1;
        }
        if (connectedParents >= 2 + (layerIndex % 2)) {
          break;
        }
      }
    }
    for (let index = 1; index < currentLayer.length; index += 1) {
      if (rng() < 0.45) {
        const previous = currentLayer[index - 1]!;
        const room = currentLayer[index]!;
        addHallwayBetweenRooms(previous, room);
      }
    }
  }

  return hallways;
}

function roomEdgePointToward(
  room: DungeonRoomLayout,
  target: ProceduralPoint,
): ProceduralPoint {
  const dx = target.x - room.centerX;
  const dy = target.y - room.centerY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? room.maxX : room.minX,
      y: snap(room.centerY),
    };
  }
  return {
    x: snap(room.centerX),
    y: dy >= 0 ? room.maxY : room.minY,
  };
}

function hallwayRectsOnlyTouchRooms(
  hallways: readonly ProceduralRect[],
  allowedRooms: readonly ProceduralDungeonRoom[],
  allRooms: readonly ProceduralDungeonRoom[],
): boolean {
  return hallways.every((hallway) =>
    allRooms.every(
      (room) =>
        allowedRooms.includes(room) ||
        !rectsOverlap(hallway, shrinkRect(room, 1)),
    ),
  );
}

function shrinkRect(rect: ProceduralRect, amount: number): ProceduralRect {
  return {
    minX: rect.minX + amount,
    minY: rect.minY + amount,
    maxX: rect.maxX - amount,
    maxY: rect.maxY - amount,
  };
}

function nearestRoomsTo<T extends DungeonRoomLayout>(
  point: ProceduralPoint,
  rooms: readonly T[],
  limit: number,
): T[] {
  return [...rooms]
    .sort(
      (left, right) =>
        distanceSquared(point.x, point.y, left.centerX, left.centerY) -
        distanceSquared(point.x, point.y, right.centerX, right.centerY),
    )
    .slice(0, limit);
}

function makeDungeonHallwayRect(
  from: ProceduralPoint,
  to: ProceduralPoint,
): ProceduralRect {
  const halfWidth = DUNGEON_HALLWAY_WIDTH / 2;
  return {
    minX: snapEdge(Math.min(from.x, to.x) - halfWidth),
    minY: snapEdge(Math.min(from.y, to.y) - halfWidth),
    maxX: snapEdge(Math.max(from.x, to.x) + halfWidth),
    maxY: snapEdge(Math.max(from.y, to.y) + halfWidth),
  };
}

function createDungeonFilledStructureHitboxes(
  bounds: ProceduralRect,
  rooms: readonly ProceduralDungeonRoom[],
  hallways: readonly ProceduralRect[],
  dungeonCenterX: number,
  dungeonCenterY: number,
): NonNullable<ProceduralSpawnSpec["hitboxRects"]> {
  const openRects = [...rooms, ...hallways];
  const cols = Math.ceil((bounds.maxX - bounds.minX) / DUNGEON_FILL_CELL_SIZE);
  const rows = Math.ceil((bounds.maxY - bounds.minY) / DUNGEON_FILL_CELL_SIZE);
  const solid = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x =
        bounds.minX + col * DUNGEON_FILL_CELL_SIZE + DUNGEON_FILL_CELL_SIZE / 2;
      const y =
        bounds.minY + row * DUNGEON_FILL_CELL_SIZE + DUNGEON_FILL_CELL_SIZE / 2;
      solid[row * cols + col] = openRects.some((rect) =>
        pointInRect({ x, y }, rect),
      )
        ? 0
        : 1;
    }
  }

  return compressSolidDungeonCells(bounds, cols, rows, solid).map((rect) => ({
    width: rect.maxX - rect.minX,
    height: rect.maxY - rect.minY,
    offsetX: rect.minX + (rect.maxX - rect.minX) / 2 - dungeonCenterX,
    offsetY: rect.minY + (rect.maxY - rect.minY) / 2 - dungeonCenterY,
  }));
}

function compressSolidDungeonCells(
  bounds: ProceduralRect,
  cols: number,
  rows: number,
  solid: Uint8Array,
): ProceduralRect[] {
  const rowRuns: ProceduralRect[] = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      while (col < cols && solid[row * cols + col] === 0) {
        col += 1;
      }
      const startCol = col;
      while (col < cols && solid[row * cols + col] === 1) {
        col += 1;
      }
      if (col > startCol) {
        rowRuns.push({
          minX: bounds.minX + startCol * DUNGEON_FILL_CELL_SIZE,
          minY: bounds.minY + row * DUNGEON_FILL_CELL_SIZE,
          maxX: bounds.minX + col * DUNGEON_FILL_CELL_SIZE,
          maxY: bounds.minY + (row + 1) * DUNGEON_FILL_CELL_SIZE,
        });
      }
    }
  }
  return mergeAlignedRects(rowRuns);
}

function mergeAlignedRects(rects: readonly ProceduralRect[]): ProceduralRect[] {
  const sorted = [...rects].sort((left, right) => {
    if (left.minX !== right.minX) {
      return left.minX - right.minX;
    }
    if (left.maxX !== right.maxX) {
      return left.maxX - right.maxX;
    }
    return left.minY - right.minY;
  });
  const merged: ProceduralRect[] = [];
  for (const rect of sorted) {
    if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) {
      continue;
    }
    const previous = merged.at(-1);
    if (
      previous &&
      previous.minX === rect.minX &&
      previous.maxX === rect.maxX &&
      previous.maxY === rect.minY
    ) {
      previous.maxY = rect.maxY;
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}

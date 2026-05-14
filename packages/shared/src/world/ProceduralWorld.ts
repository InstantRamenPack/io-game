import seedrandom from "seedrandom";
import { getEntityContent } from "@shared/content/catalog.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export const PROCEDURAL_WORLD_SEED = 1337;
export const PROCEDURAL_GRID_SIZE = 3;
export const PROCEDURAL_SECTOR_SIZE = 5120;
export const PROCEDURAL_WORLD_SIZE = {
  w: PROCEDURAL_GRID_SIZE * PROCEDURAL_SECTOR_SIZE,
  h: PROCEDURAL_GRID_SIZE * PROCEDURAL_SECTOR_SIZE,
} as const;
export const PROCEDURAL_TILE_SIZE = 16;

export const REQUIRED_DUNGEON_ROOM_ROLES = [
  "entrance",
  "combat",
  "enemy_swarm",
  "treasure",
  "maze",
  "trap",
  "armory",
  "mini_boss",
  "boss",
] as const;

export type DungeonRoomRole = (typeof REQUIRED_DUNGEON_ROOM_ROLES)[number];

export type SectorArchetype =
  | "home"
  | "extraction"
  | "dungeon"
  | "military"
  | "forest"
  | "ruined_town"
  | "abandoned_suburb"
  | "industrial_yard"
  | "lake_district"
  | "farmstead"
  | "quarry"
  | "swamp"
  | "bunker_edge"
  | "wreckage_field"
  | "roadside_village";

export type ProceduralRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ProceduralPoint = {
  x: number;
  y: number;
};

export type ProceduralSpawnSpec = ProceduralPoint & {
  typeId: ResourceId;
  label?: string;
  hitboxRects?: Array<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  }>;
  crateLoot?: ProceduralCrateLootSlot[];
};

export type ProceduralLootSpec = ProceduralPoint & {
  typeId: ResourceId;
  amount?: number;
  kind: "stackable" | "weapon";
  rewardTier: "common" | "uncommon" | "rare" | "epic";
};

export type ProceduralCrateLootSlot = {
  typeId: ResourceId;
  amount?: number;
  kind: "stackable" | "weapon";
};

export type ProceduralMapMarker = ProceduralPoint & {
  id: string;
  label: string;
  archetype: SectorArchetype;
  importance: "sector" | "major" | "reward" | "route";
  discoveredByDefault: boolean;
};

export type ProceduralPoiFeature = ProceduralRect & {
  id: string;
  label: string;
  role:
    | "spawn_core"
    | "defense_ring"
    | "facility"
    | "checkpoint"
    | "barracks"
    | "command_center"
    | "armory_vault"
    | "motor_pool"
    | "comms"
    | "training_yard"
    | "watch_tower"
    | "trail"
    | "cabin"
    | "camp"
    | "pond"
    | "bridge"
    | "shrine"
    | "hidden_cache"
    | "predator_clearing"
    | "residential_block"
    | "ruin_cluster"
    | "industrial_yard"
    | "resource_pit"
    | "helipad"
    | "approach_route"
    | "danger_perimeter"
    | "reward_cache"
    | `dungeon_${DungeonRoomRole}`;
  center: ProceduralPoint;
  risk: "low" | "medium" | "high" | "boss";
  hasReward: boolean;
};

export type ProceduralDungeonRoom = ProceduralRect & {
  id: string;
  role: DungeonRoomRole;
  centerX: number;
  centerY: number;
};

export type ProceduralDungeonEntrance = ProceduralPoint & {
  side: "north" | "south" | "west" | "east";
};

export type ProceduralDungeonPlan = ProceduralRect & {
  id: string;
  rooms: ProceduralDungeonRoom[];
  entrances: ProceduralDungeonEntrance[];
  wallHitboxRects: NonNullable<ProceduralSpawnSpec["hitboxRects"]>;
  doors: ProceduralSpawnSpec[];
};

export type ProceduralSector = ProceduralRect & {
  id: string;
  row: number;
  col: number;
  archetype: SectorArchetype;
  label: string;
  center: ProceduralPoint;
  landmark: ProceduralMapMarker;
  rewardArea: ProceduralRect;
  traversalConnections: string[];
  structures: ProceduralSpawnSpec[];
  buildings: ProceduralSpawnSpec[];
  enemies: ProceduralSpawnSpec[];
  loot: ProceduralLootSpec[];
  features: ProceduralPoiFeature[];
  minimapMarkers: ProceduralMapMarker[];
  hasLightsOut: boolean;
  allowsFastBuildingDecay: boolean;
};

export type ProceduralWorldLayout = {
  seed: number;
  tileSize: number;
  worldSize: { w: number; h: number };
  sectorSize: number;
  sectors: ProceduralSector[];
  centerSectorId: string;
  extractionSectorId: string;
  dungeonSectorId: string;
  militarySectorId: string;
  forestSectorId: string;
  homeBounds: ProceduralRect;
  extraction: ProceduralPoint & { radius: number };
  dungeon: ProceduralDungeonPlan;
  minimapMarkers: ProceduralMapMarker[];
};

const EDGE_COORDS = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 2 },
  { row: 2, col: 1 },
] as const;

const CORNER_COORDS = [
  { row: 0, col: 0 },
  { row: 0, col: 2 },
  { row: 2, col: 0 },
  { row: 2, col: 2 },
] as const;

const FILLER_ARCHETYPES: readonly SectorArchetype[] = [
  "ruined_town",
  "abandoned_suburb",
  "industrial_yard",
  "lake_district",
  "farmstead",
  "quarry",
  "swamp",
  "bunker_edge",
  "wreckage_field",
  "roadside_village",
];

const DUNGEON_ROOM_LINEAR_SCALE = 0.7;

const ENEMY_BY_ARCHETYPE: Record<SectorArchetype, readonly ResourceId[]> = {
  home: ["enemy:drifter" as ResourceId],
  extraction: [
    "enemy:police" as ResourceId,
    "enemy:shoota" as ResourceId,
    "enemy:bomber" as ResourceId,
    "enemy:commander" as ResourceId,
  ],
  dungeon: [
    "enemy:drifter" as ResourceId,
    "enemy:shoota" as ResourceId,
    "enemy:megaknight" as ResourceId,
  ],
  military: [
    "enemy:police" as ResourceId,
    "enemy:shoota" as ResourceId,
    "enemy:sniper" as ResourceId,
    "enemy:saboteur" as ResourceId,
    "enemy:wallbreaker" as ResourceId,
    "enemy:commander" as ResourceId,
  ],
  forest: [
    "enemy:drifter" as ResourceId,
    "enemy:stalker" as ResourceId,
    "enemy:bomber" as ResourceId,
    "enemy:wallbreaker" as ResourceId,
  ],
  ruined_town: ["enemy:drifter" as ResourceId, "enemy:shoota" as ResourceId],
  abandoned_suburb: [
    "enemy:drifter" as ResourceId,
    "enemy:police" as ResourceId,
  ],
  industrial_yard: [
    "enemy:saboteur" as ResourceId,
    "enemy:wallbreaker" as ResourceId,
  ],
  lake_district: ["enemy:drifter" as ResourceId, "enemy:bomber" as ResourceId],
  farmstead: ["enemy:drifter" as ResourceId, "enemy:wallbreaker" as ResourceId],
  quarry: ["enemy:wallbreaker" as ResourceId, "enemy:megaknight" as ResourceId],
  swamp: ["enemy:bomber" as ResourceId, "enemy:drifter" as ResourceId],
  bunker_edge: ["enemy:police" as ResourceId, "enemy:saboteur" as ResourceId],
  wreckage_field: [
    "enemy:drifter" as ResourceId,
    "enemy:saboteur" as ResourceId,
  ],
  roadside_village: [
    "enemy:drifter" as ResourceId,
    "enemy:shoota" as ResourceId,
  ],
};

const LOOT_BY_TIER: Record<
  ProceduralLootSpec["rewardTier"],
  readonly ResourceId[]
> = {
  common: [
    "item:hunk" as ResourceId,
    "item:junk_food" as ResourceId,
    "item:pistol_mag" as ResourceId,
    "item:rifle_mag" as ResourceId,
  ],
  uncommon: [
    "item:basic_spear" as ResourceId,
    "item:lead_pipe" as ResourceId,
    "item:quality_food" as ResourceId,
    "item:crossbow_mag" as ResourceId,
  ],
  rare: [
    "item:basic_rifle" as ResourceId,
    "item:crossbow" as ResourceId,
    "item:blueprint_katana" as ResourceId,
    "item:sniper_mag" as ResourceId,
  ],
  epic: [
    "item:sniper" as ResourceId,
    "item:drone_shooter" as ResourceId,
    "item:blueprint_sniper" as ResourceId,
    "item:blueprint_spiked_spear" as ResourceId,
  ],
};

export function generateProceduralWorldLayout(
  seed = PROCEDURAL_WORLD_SEED,
): ProceduralWorldLayout {
  const rng = seedrandom(String(seed));
  const sectorSize = PROCEDURAL_SECTOR_SIZE;
  const assigned = new Map<string, SectorArchetype>();

  assigned.set(sectorKey(1, 1), "home");
  const cornerCoords = shuffle(rng, [...CORNER_COORDS]);
  const dungeonCoord = cornerCoords.shift();
  const extractionCoord = cornerCoords.shift();
  if (!dungeonCoord || !extractionCoord) {
    throw new Error("Expected enough corner sectors for required POIs.");
  }
  assigned.set(sectorKey(dungeonCoord.row, dungeonCoord.col), "dungeon");
  assigned.set(
    sectorKey(extractionCoord.row, extractionCoord.col),
    "extraction",
  );

  const availableEdges = shuffle(rng, [...EDGE_COORDS]);
  const militaryCoord = availableEdges.shift();
  const forestCoord = availableEdges.shift();
  if (!militaryCoord || !forestCoord) {
    throw new Error("Expected enough edge sectors for required POIs.");
  }
  assigned.set(sectorKey(militaryCoord.row, militaryCoord.col), "military");
  assigned.set(sectorKey(forestCoord.row, forestCoord.col), "forest");

  const fillers = shuffle(rng, [...FILLER_ARCHETYPES]);
  for (let row = 0; row < PROCEDURAL_GRID_SIZE; row += 1) {
    for (let col = 0; col < PROCEDURAL_GRID_SIZE; col += 1) {
      const key = sectorKey(row, col);
      if (!assigned.has(key)) {
        assigned.set(key, fillers.shift() ?? "ruined_town");
      }
    }
  }

  const dungeonSectorRect = sectorRect(dungeonCoord.row, dungeonCoord.col);
  const dungeon = createDungeonPlan(
    seed,
    dungeonSectorRect,
    dungeonCoord.row,
    dungeonCoord.col,
  );
  const sectors: ProceduralSector[] = [];
  for (let row = 0; row < PROCEDURAL_GRID_SIZE; row += 1) {
    for (let col = 0; col < PROCEDURAL_GRID_SIZE; col += 1) {
      const archetype = assigned.get(sectorKey(row, col));
      if (!archetype) {
        throw new Error(`Missing sector archetype for ${row}:${col}`);
      }
      sectors.push(createSector(seed, rng, row, col, archetype, dungeon));
    }
  }

  const homeBounds = insetRect(sectorRect(1, 1), 280);
  const extractionSector = requireSector(sectors, "extraction");
  const extraction = {
    x: extractionSector.center.x,
    y: extractionSector.center.y,
    radius: 160,
  };
  const minimapMarkers = sectors.flatMap((sector) => sector.minimapMarkers);

  return {
    seed,
    tileSize: PROCEDURAL_TILE_SIZE,
    worldSize: PROCEDURAL_WORLD_SIZE,
    sectorSize,
    sectors,
    centerSectorId: sectorKey(1, 1),
    extractionSectorId: extractionSector.id,
    dungeonSectorId: sectorKey(dungeonCoord.row, dungeonCoord.col),
    militarySectorId: sectorKey(militaryCoord.row, militaryCoord.col),
    forestSectorId: sectorKey(forestCoord.row, forestCoord.col),
    homeBounds,
    extraction,
    dungeon,
    minimapMarkers,
  };
}

export function sectorKey(row: number, col: number): string {
  return `sector_${row}_${col}`;
}

export function pointInRect(
  point: ProceduralPoint,
  rect: ProceduralRect,
): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

export function getSectorForPoint(
  layout: ProceduralWorldLayout,
  point: ProceduralPoint,
): ProceduralSector | undefined {
  return layout.sectors.find((sector) => pointInRect(point, sector));
}

function createSector(
  seed: number,
  worldRng: seedrandom.PRNG,
  row: number,
  col: number,
  archetype: SectorArchetype,
  dungeon: ProceduralDungeonPlan,
): ProceduralSector {
  const rect = sectorRect(row, col);
  const center = snapPoint({
    x: (rect.minX + rect.maxX) / 2,
    y: (rect.minY + rect.maxY) / 2,
  });
  const rng = seedrandom(`${seed}:${row}:${col}:${archetype}`);
  const structures: ProceduralSpawnSpec[] = [];
  const buildings: ProceduralSpawnSpec[] = [];
  const enemies: ProceduralSpawnSpec[] = [];
  const loot: ProceduralLootSpec[] = [];
  const features: ProceduralPoiFeature[] = [];
  const markers: ProceduralMapMarker[] = [];
  const rewardArea = insetRect(
    {
      minX: center.x - 320,
      minY: center.y - 240,
      maxX: center.x + 320,
      maxY: center.y + 240,
    },
    0,
  );
  const landmark = marker(
    `${sectorKey(row, col)}_landmark`,
    labelForArchetype(archetype),
    archetype,
    center.x,
    center.y,
    archetype === "home" ? "major" : "sector",
    archetype === "home",
  );
  markers.push(landmark);

  if (archetype !== "home" && archetype !== "dungeon") {
    addPerimeterRoutes(structures, rect);
  }
  addArchetypeContent(
    rng,
    archetype,
    rect,
    center,
    structures,
    buildings,
    features,
    markers,
  );
  addEncounterGroups(rng, archetype, rect, center, enemies);
  if (archetype !== "dungeon") {
    addSectorLoot(rng, archetype, center, loot);
  }

  if (archetype === "home") {
    buildings.push(spawn("building:recycler", center.x, center.y - 160));
    buildings.push(
      spawn("building:crafting_station", center.x - 224, center.y),
    );
    buildings.push(spawn("building:chest", center.x + 224, center.y));
    addFeature(
      features,
      markers,
      "home_spawn_core",
      "Home Spawn Core",
      "spawn_core",
      archetype,
      center.x,
      center.y,
      760,
      520,
      "low",
      true,
      "major",
      true,
    );
    addFeature(
      features,
      markers,
      "home_defense_ring",
      "Home Defense Ring",
      "defense_ring",
      archetype,
      center.x,
      center.y,
      1280,
      960,
      "medium",
      false,
      "route",
      true,
    );
    loot.push(
      lootSpec(
        "item:hunk",
        center.x - 128,
        center.y + 192,
        "stackable",
        "common",
        5,
      ),
    );
  } else if (archetype === "extraction") {
    markers.push(
      marker(
        "extraction_helipad",
        "Extraction Helipad",
        archetype,
        center.x,
        center.y,
        "major",
        true,
      ),
    );
    addMilitaryFence(structures, center, 960, 720);
    enemies.push(
      spawn("enemy:commander", center.x, center.y - 360),
      spawn("enemy:sniper", center.x - 420, center.y - 240),
      spawn("enemy:sniper", center.x + 420, center.y - 240),
    );
    addFeature(
      features,
      markers,
      "extraction_pad",
      "Extraction Pad",
      "helipad",
      archetype,
      center.x,
      center.y,
      420,
      420,
      "boss",
      true,
      "major",
      true,
    );
    addFeature(
      features,
      markers,
      "extraction_north_approach",
      "North Approach",
      "approach_route",
      archetype,
      center.x,
      center.y - 720,
      360,
      900,
      "high",
      false,
      "route",
      true,
    );
    addFeature(
      features,
      markers,
      "extraction_danger_perimeter",
      "Extraction Perimeter",
      "danger_perimeter",
      archetype,
      center.x,
      center.y,
      1200,
      900,
      "boss",
      false,
      "major",
      false,
    );
    loot.push(
      lootSpec(
        "item:sniper_mag",
        center.x + 320,
        center.y - 192,
        "stackable",
        "rare",
        2,
      ),
    );
  } else if (archetype === "dungeon") {
    addDungeonArchitecture(structures, buildings, dungeon);
    addFeature(
      features,
      markers,
      "dungeon_gate",
      "Dungeon Gate",
      "checkpoint",
      archetype,
      dungeon.entrances[0]?.x ?? center.x,
      dungeon.entrances[0]?.y ?? center.y,
      520,
      260,
      "high",
      false,
      "major",
      true,
    );
    addFeature(
      features,
      markers,
      "dungeon_final_reward",
      "Dungeon Final Reward",
      "reward_cache",
      archetype,
      dungeon.rooms.at(-1)?.centerX ?? center.x,
      dungeon.rooms.at(-1)?.centerY ?? center.y,
      520,
      360,
      "boss",
      true,
      "reward",
      false,
    );
    markers.push(
      marker(
        "dungeon_gate",
        "Dungeon Gate",
        archetype,
        dungeon.entrances[0]?.x ?? center.x,
        dungeon.entrances[0]?.y ?? center.y,
        "major",
        true,
      ),
    );
    for (const room of dungeon.rooms) {
      addFeature(
        features,
        markers,
        room.id,
        dungeonRoomLabel(room.role),
        `dungeon_${room.role}`,
        archetype,
        room.centerX,
        room.centerY,
        room.maxX - room.minX,
        room.maxY - room.minY,
        dungeonRoomRisk(room.role),
        ["treasure", "armory", "trap", "mini_boss", "boss"].includes(room.role),
        room.role === "boss" || room.role === "mini_boss" ? "major" : "route",
        room.role === "entrance",
      );
      addDungeonRoomContent(room, enemies, loot, buildings);
    }
  } else if (archetype === "military") {
    markers.push(
      marker(
        "military_command",
        "Military Command",
        archetype,
        center.x,
        center.y - 320,
        "major",
        true,
      ),
    );
    addMilitaryFence(structures, center, 1400, 1100);
    addMilitaryBaseFeatures(features, markers, archetype, center);
    enemies.push(
      spawn("enemy:commander", center.x, center.y - 340),
      spawn("enemy:sniper", center.x - 760, center.y - 760),
      spawn("enemy:sniper", center.x + 760, center.y + 760),
    );
    loot.push(
      lootSpec(
        "item:drone_shooter",
        center.x,
        center.y - 384,
        "weapon",
        "epic",
        1,
      ),
    );
  } else if (archetype === "forest") {
    markers.push(
      marker(
        "forest_shrine",
        "Forest Shrine",
        archetype,
        center.x + 420,
        center.y - 260,
        "major",
        true,
      ),
    );
    addForestFeatures(features, markers, archetype, center);
    enemies.push(
      spawn("enemy:stalker", center.x + 720, center.y - 580),
      spawn("enemy:stalker", center.x - 650, center.y - 420),
    );
    loot.push(
      lootSpec(
        "item:blueprint_spiked_spear",
        center.x + 420,
        center.y - 228,
        "stackable",
        "rare",
        1,
      ),
    );
  }

  markers.push(
    marker(
      `${sectorKey(row, col)}_reward`,
      `${labelForArchetype(archetype)} Cache`,
      archetype,
      (rewardArea.minX + rewardArea.maxX) / 2,
      (rewardArea.minY + rewardArea.maxY) / 2,
      "reward",
      archetype === "home",
    ),
  );

  const staticSpawns = pruneOverlappingStaticSpawns([
    ...structures,
    ...buildings,
  ]);
  const structureTypeIds = new Set(
    structures.map((structure) => structure.typeId),
  );

  return {
    id: sectorKey(row, col),
    row,
    col,
    archetype,
    label: labelForArchetype(archetype),
    ...rect,
    center,
    landmark,
    rewardArea,
    traversalConnections: adjacentSectorIds(row, col),
    structures: staticSpawns.filter((spec) =>
      structureTypeIds.has(spec.typeId),
    ),
    buildings: staticSpawns.filter(
      (spec) => !structureTypeIds.has(spec.typeId),
    ),
    enemies,
    loot,
    features,
    minimapMarkers: markers,
    hasLightsOut: archetype !== "home",
    allowsFastBuildingDecay: archetype !== "home",
  };
}

function pruneOverlappingStaticSpawns(
  specs: readonly ProceduralSpawnSpec[],
): ProceduralSpawnSpec[] {
  const accepted: ProceduralSpawnSpec[] = [];
  const acceptedHitboxes: NonNullable<
    ReturnType<typeof resolveSpawnHitboxes>
  >[] = [];

  for (const spec of specs) {
    const hitboxes = resolveSpawnHitboxes(spec);
    if (!hitboxes) {
      accepted.push(spec);
      continue;
    }
    if (
      acceptedHitboxes.some((candidate) =>
        doResolvedRectSetsOverlap(hitboxes, candidate),
      )
    ) {
      continue;
    }
    accepted.push(spec);
    acceptedHitboxes.push(hitboxes);
  }

  return accepted;
}

function resolveSpawnHitboxes(spec: ProceduralSpawnSpec) {
  const content = getEntityContent(spec.typeId);
  const hitboxProfiles = content?.hitboxProfiles;
  if (!hitboxProfiles) {
    return null;
  }
  const activeProfile =
    (content.activeHitboxProfile &&
      hitboxProfiles[content.activeHitboxProfile]) ??
    Object.values(hitboxProfiles)[0];
  if (!activeProfile) {
    return null;
  }
  return resolveHitboxRects(spec.x, spec.y, activeProfile);
}

function createDungeonPlan(
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
  const wallThickness = 64;
  const rooms = createBspDungeonRooms(
    rng,
    {
      minX: minX + wallThickness + 96,
      minY: minY + wallThickness + 96,
      maxX: maxX - wallThickness - 96,
      maxY: maxY - wallThickness - 96,
    },
    9 + Math.floor(rng() * 4),
  );

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
  const centerX = snap((minX + maxX) / 2);
  const centerY = snap((minY + maxY) / 2);
  const wallRects = [
    ...createDungeonOuterWallHitboxes(minX, minY, maxX, maxY, entrances),
    ...createDungeonInternalWallHitboxes(rooms, centerX, centerY),
  ];
  const doors = createDungeonDoorSpawns(rooms, entrances);

  return {
    id: "dungeon_alpha",
    minX,
    minY,
    maxX,
    maxY,
    rooms,
    entrances,
    wallHitboxRects: wallRects,
    doors,
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

function createBspDungeonRooms(
  rng: seedrandom.PRNG,
  bounds: ProceduralRect,
  targetRoomCount: number,
): ProceduralDungeonRoom[] {
  const leaves: DungeonBspLeaf[] = [bounds];
  const minLeafSize = 1120;

  while (leaves.length < targetRoomCount) {
    const splitIndex = findLargestSplittableLeaf(leaves, minLeafSize);
    if (splitIndex < 0) {
      break;
    }
    const leaf = leaves.splice(splitIndex, 1)[0]!;
    const width = leaf.maxX - leaf.minX;
    const height = leaf.maxY - leaf.minY;
    const splitVertical = width >= height;
    const splitRatio = 0.42 + rng() * 0.16;
    if (splitVertical) {
      const splitX = snapEdge(leaf.minX + width * splitRatio);
      leaves.push(
        { ...leaf, maxX: splitX - 48 },
        { ...leaf, minX: splitX + 48 },
      );
    } else {
      const splitY = snapEdge(leaf.minY + height * splitRatio);
      leaves.push(
        { ...leaf, maxY: splitY - 48 },
        { ...leaf, minY: splitY + 48 },
      );
    }
  }

  const orderedLeaves = [...leaves].sort((left, right) => {
    const leftScore = left.minY + left.minX * 0.05;
    const rightScore = right.minY + right.minX * 0.05;
    return leftScore - rightScore;
  });
  const roleOrder = buildDungeonRoleOrder(orderedLeaves.length);

  return orderedLeaves.map((leaf, index) => {
    const inset = 72;
    const fullMinX = snapEdge(leaf.minX + inset);
    const fullMinY = snapEdge(leaf.minY + inset);
    const fullMaxX = snapEdge(leaf.maxX - inset);
    const fullMaxY = snapEdge(leaf.maxY - inset);
    const centerX = snap((fullMinX + fullMaxX) / 2);
    const centerY = snap((fullMinY + fullMaxY) / 2);
    const halfWidth = snapEdge(
      ((fullMaxX - fullMinX) * DUNGEON_ROOM_LINEAR_SCALE) / 2,
    );
    const halfHeight = snapEdge(
      ((fullMaxY - fullMinY) * DUNGEON_ROOM_LINEAR_SCALE) / 2,
    );
    const minX = snapEdge(centerX - halfWidth);
    const minY = snapEdge(centerY - halfHeight);
    const maxX = snapEdge(centerX + halfWidth);
    const maxY = snapEdge(centerY + halfHeight);
    const role = roleOrder[index] ?? "combat";
    return {
      id: `dungeon_${role}_${index}`,
      role,
      minX,
      minY,
      maxX,
      maxY,
      centerX,
      centerY,
    };
  });
}

function findLargestSplittableLeaf(
  leaves: readonly DungeonBspLeaf[],
  minLeafSize: number,
): number {
  let bestIndex = -1;
  let bestArea = 0;
  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index]!;
    const width = leaf.maxX - leaf.minX;
    const height = leaf.maxY - leaf.minY;
    if (Math.max(width, height) < minLeafSize * 2) {
      continue;
    }
    const area = width * height;
    if (area > bestArea) {
      bestArea = area;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildDungeonRoleOrder(roomCount: number): DungeonRoomRole[] {
  const roles: DungeonRoomRole[] = [...REQUIRED_DUNGEON_ROOM_ROLES];
  const repeats: DungeonRoomRole[] = [
    "combat",
    "enemy_swarm",
    "maze",
    "trap",
    "treasure",
  ];
  let repeatIndex = 0;
  while (roles.length < roomCount) {
    roles.push(repeats[repeatIndex % repeats.length]!);
    repeatIndex += 1;
  }
  return roles.slice(0, roomCount);
}

function createDungeonOuterWallHitboxes(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  entrances: readonly ProceduralDungeonEntrance[],
): NonNullable<ProceduralSpawnSpec["hitboxRects"]> {
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const wallThickness = 64;
  const doorHalfWidth = 176;
  const rects: ProceduralRect[] = [];
  const addAbsoluteRect = (
    rectMinX: number,
    rectMinY: number,
    rectMaxX: number,
    rectMaxY: number,
  ) => {
    if (rectMaxX <= rectMinX || rectMaxY <= rectMinY) {
      return;
    }
    rects.push({
      minX: snapEdge(rectMinX),
      minY: snapEdge(rectMinY),
      maxX: snapEdge(rectMaxX),
      maxY: snapEdge(rectMaxY),
    });
  };

  const northDoor = entrances.find((entrance) => entrance.side === "north");
  const southDoor = entrances.find((entrance) => entrance.side === "south");
  const westDoor = entrances.find((entrance) => entrance.side === "west");
  const eastDoor = entrances.find((entrance) => entrance.side === "east");

  addSplitHorizontalWall(
    addAbsoluteRect,
    minX,
    maxX,
    minY,
    minY + wallThickness,
    northDoor?.x,
    doorHalfWidth,
  );
  addSplitHorizontalWall(
    addAbsoluteRect,
    minX,
    maxX,
    maxY - wallThickness,
    maxY,
    southDoor?.x,
    doorHalfWidth,
  );
  addSplitVerticalWall(
    addAbsoluteRect,
    minY,
    maxY,
    minX,
    minX + wallThickness,
    westDoor?.y,
    doorHalfWidth,
  );
  addSplitVerticalWall(
    addAbsoluteRect,
    minY,
    maxY,
    maxX - wallThickness,
    maxX,
    eastDoor?.y,
    doorHalfWidth,
  );

  return rects.map((rect) => ({
    width: rect.maxX - rect.minX,
    height: rect.maxY - rect.minY,
    offsetX: rect.minX + (rect.maxX - rect.minX) / 2 - centerX,
    offsetY: rect.minY + (rect.maxY - rect.minY) / 2 - centerY,
  }));
}

function createDungeonInternalWallHitboxes(
  rooms: readonly ProceduralDungeonRoom[],
  dungeonCenterX: number,
  dungeonCenterY: number,
): NonNullable<ProceduralSpawnSpec["hitboxRects"]> {
  const walls: NonNullable<ProceduralSpawnSpec["hitboxRects"]> = [];
  const addWall = (minX: number, minY: number, maxX: number, maxY: number) => {
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) {
      return;
    }
    walls.push({
      width,
      height,
      offsetX: minX + width / 2 - dungeonCenterX,
      offsetY: minY + height / 2 - dungeonCenterY,
    });
  };

  for (const room of rooms) {
    addDungeonRoomInteriorWalls(addWall, room);
    if (room.role === "maze") {
      addMazeRoomWalls(addWall, room);
    }
  }

  return walls;
}

function addDungeonRoomInteriorWalls(
  addWall: (minX: number, minY: number, maxX: number, maxY: number) => void,
  room: ProceduralDungeonRoom,
): void {
  const t = 48;
  const doorHalfWidth = 112;
  addSplitHorizontalWall(
    addWall,
    room.minX,
    room.maxX,
    room.minY,
    room.minY + t,
    room.centerX,
    doorHalfWidth,
  );
  addSplitHorizontalWall(
    addWall,
    room.minX,
    room.maxX,
    room.maxY - t,
    room.maxY,
    room.centerX,
    doorHalfWidth,
  );
  addSplitVerticalWall(
    addWall,
    room.minY + t,
    room.maxY - t,
    room.minX,
    room.minX + t,
    room.centerY,
    doorHalfWidth,
  );
  addSplitVerticalWall(
    addWall,
    room.minY + t,
    room.maxY - t,
    room.maxX - t,
    room.maxX,
    room.centerY,
    doorHalfWidth,
  );
}

function createDungeonDoorSpawns(
  rooms: readonly ProceduralDungeonRoom[],
  entrances: readonly ProceduralDungeonEntrance[],
): ProceduralSpawnSpec[] {
  const nearestEntrance = entrances[0];
  const lockRoles = new Set<DungeonRoomRole>(["treasure", "boss"]);
  return rooms
    .filter((room) => lockRoles.has(room.role))
    .map((room) => {
      const dx = nearestEntrance ? room.centerX - nearestEntrance.x : 1;
      const dy = nearestEntrance ? room.centerY - nearestEntrance.y : 0;
      if (Math.abs(dx) >= Math.abs(dy)) {
        return spawn(
          "building:dungeon_door",
          dx >= 0 ? room.minX : room.maxX,
          room.centerY,
        );
      }
      return spawn(
        "building:dungeon_door",
        room.centerX,
        dy >= 0 ? room.minY : room.maxY,
      );
    });
}

function addSplitHorizontalWall(
  addRect: (minX: number, minY: number, maxX: number, maxY: number) => void,
  minX: number,
  maxX: number,
  wallMinY: number,
  wallMaxY: number,
  doorX: number | undefined,
  doorHalfWidth: number,
): void {
  if (doorX === undefined) {
    addRect(minX, wallMinY, maxX, wallMaxY);
    return;
  }
  addRect(minX, wallMinY, doorX - doorHalfWidth, wallMaxY);
  addRect(doorX + doorHalfWidth, wallMinY, maxX, wallMaxY);
}

function addSplitVerticalWall(
  addRect: (minX: number, minY: number, maxX: number, maxY: number) => void,
  minY: number,
  maxY: number,
  wallMinX: number,
  wallMaxX: number,
  doorY: number | undefined,
  doorHalfWidth: number,
): void {
  if (doorY === undefined) {
    addRect(wallMinX, minY, wallMaxX, maxY);
    return;
  }
  addRect(wallMinX, minY, wallMaxX, doorY - doorHalfWidth);
  addRect(wallMinX, doorY + doorHalfWidth, wallMaxX, maxY);
}

function addMazeRoomWalls(
  addRect: (minX: number, minY: number, maxX: number, maxY: number) => void,
  room: ProceduralDungeonRoom,
): void {
  const t = 48;
  const addRoomRect = (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ) => {
    const boundedMinX = snapEdge(clamp(minX, room.minX + 96, room.maxX - 96));
    const boundedMinY = snapEdge(clamp(minY, room.minY + 96, room.maxY - 96));
    const boundedMaxX = snapEdge(clamp(maxX, boundedMinX + t, room.maxX - 96));
    const boundedMaxY = snapEdge(clamp(maxY, boundedMinY + t, room.maxY - 96));
    addRect(boundedMinX, boundedMinY, boundedMaxX, boundedMaxY);
  };
  addRoomRect(
    room.minX + 168,
    room.minY + 140,
    room.minX + 168 + t,
    room.maxY - 420,
  );
  addRoomRect(
    room.minX + 360,
    room.minY + 120,
    room.maxX - 160,
    room.minY + 120 + t,
  );
  addRoomRect(
    room.maxX - 280,
    room.minY + 360,
    room.maxX - 280 + t,
    room.maxY - 140,
  );
  addRoomRect(
    room.minX + 180,
    room.maxY - 260,
    room.maxX - 360,
    room.maxY - 260 + t,
  );
}

function addArchetypeContent(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  rect: ProceduralRect,
  center: ProceduralPoint,
  structures: ProceduralSpawnSpec[],
  buildings: ProceduralSpawnSpec[],
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
): void {
  switch (archetype) {
    case "home":
      break;
    case "military":
      addHouseCluster(structures, center.x - 320, center.y, 5);
      break;
    case "forest":
      addForest(structures, rng, rect, 46);
      break;
    case "extraction":
      addHouseCluster(structures, center.x + 420, center.y - 320, 2);
      break;
    case "dungeon":
      break;
    case "industrial_yard":
    case "quarry":
    case "bunker_edge":
      addMilitaryFence(structures, center, 960, 760);
      buildings.push(
        spawn("building:recycler", center.x - 320, center.y + 260),
      );
      addIndustrialFeatures(features, markers, archetype, center);
      break;
    case "lake_district":
    case "swamp":
      addForest(structures, rng, rect, 30);
      addWildlandFeatures(features, markers, archetype, center);
      break;
    case "farmstead":
    case "abandoned_suburb":
    case "roadside_village":
    case "ruined_town":
    case "wreckage_field":
      addHouseCluster(structures, center.x, center.y, 6);
      addForest(structures, rng, rect, 12);
      addResidentialFeatures(features, markers, archetype, center);
      break;
  }
}

function addEncounterGroups(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  rect: ProceduralRect,
  center: ProceduralPoint,
  enemies: ProceduralSpawnSpec[],
): void {
  if (archetype === "home") {
    return;
  }
  if (archetype === "dungeon") {
    return;
  }
  const pool = ENEMY_BY_ARCHETYPE[archetype];
  const count = archetype === "military" ? 14 : 9;
  for (let index = 0; index < count; index += 1) {
    const typeId = pool[index % pool.length] ?? "enemy:drifter";
    const angle = rng() * Math.PI * 2;
    const radius = 340 + rng() * 980;
    enemies.push(
      spawn(
        typeId,
        clamp(
          snap(center.x + Math.cos(angle) * radius),
          rect.minX + 160,
          rect.maxX - 160,
        ),
        clamp(
          snap(center.y + Math.sin(angle) * radius),
          rect.minY + 160,
          rect.maxY - 160,
        ),
      ),
    );
  }
}

function addSectorLoot(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  center: ProceduralPoint,
  loot: ProceduralLootSpec[],
): void {
  const tiers: ProceduralLootSpec["rewardTier"][] =
    archetype === "home"
      ? ["common", "common"]
      : ["common", "uncommon", "rare"];
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index] ?? "common";
    const pool = LOOT_BY_TIER[tier];
    const typeId = pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
    loot.push(
      lootSpec(
        typeId,
        center.x - 180 + index * 180,
        center.y + 260 + index * 48,
        isWeaponLoot(typeId) ? "weapon" : "stackable",
        tier,
        tier === "common" ? 3 : 1,
      ),
    );
  }
}

function addDungeonRoomContent(
  room: ProceduralDungeonRoom,
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
  buildings: ProceduralSpawnSpec[],
): void {
  const x = room.centerX;
  const y = room.centerY;
  const point = (offsetX: number, offsetY: number, margin = 96) =>
    dungeonRoomContentPoint(room, offsetX, offsetY, margin);
  const roomSpawn = (
    typeId: string,
    offsetX: number,
    offsetY: number,
    margin?: number,
  ) => {
    const position = point(offsetX, offsetY, margin);
    return spawn(typeId, position.x, position.y);
  };
  const roomLoot = (
    typeId: string,
    offsetX: number,
    offsetY: number,
    kind: ProceduralLootSpec["kind"],
    rewardTier: ProceduralLootSpec["rewardTier"],
    amount: number,
  ) => {
    const position = point(offsetX, offsetY);
    return lootSpec(typeId, position.x, position.y, kind, rewardTier, amount);
  };
  const roomCrate = (
    offsetX: number,
    offsetY: number,
    crateLoot: ProceduralCrateLootSlot[],
  ) => {
    const position = point(offsetX, offsetY);
    return crateSpawn("enemy:crate", position.x, position.y, crateLoot);
  };
  switch (room.role) {
    case "entrance":
      enemies.push(
        roomSpawn("enemy:drifter", -160, 0),
        roomSpawn("enemy:police", 160, 0),
      );
      loot.push(
        roomLoot("item:quality_food", 160, 0, "stackable", "common", 2),
      );
      break;
    case "combat":
      enemies.push(
        roomSpawn("enemy:drifter", -120, 0),
        roomSpawn("enemy:shoota", 120, 0),
        roomSpawn("enemy:police", 0, 112),
      );
      loot.push(roomLoot("item:pistol_mag", 0, 120, "stackable", "common", 2));
      break;
    case "enemy_swarm":
      enemies.push(
        roomSpawn("enemy:drifter", -240, -160),
        roomSpawn("enemy:drifter", 0, -180),
        roomSpawn("enemy:drifter", 240, -160),
        roomSpawn("enemy:shoota", -180, 140),
        roomSpawn("enemy:shoota", 180, 140),
        roomSpawn("enemy:police", 0, 220),
      );
      loot.push(lootSpec("item:rifle_mag", x, y, "stackable", "common", 2));
      break;
    case "treasure":
      enemies.push(
        roomCrate(0, 0, [
          { typeId: "item:sniper" as ResourceId, kind: "weapon" },
          {
            typeId: "item:blueprint_katana" as ResourceId,
            kind: "stackable",
            amount: 1,
          },
          {
            typeId: "item:sniper_mag" as ResourceId,
            kind: "stackable",
            amount: 3,
          },
          {
            typeId: "item:hunk" as ResourceId,
            kind: "stackable",
            amount: 12,
          },
        ]),
      );
      loot.push(lootSpec("item:hunk", x + 80, y, "stackable", "uncommon", 8));
      break;
    case "maze":
      enemies.push(
        roomSpawn("enemy:stalker", -200, -180),
        roomSpawn("enemy:police", 220, 180),
      );
      buildings.push(
        roomSpawn("building:tripwire", -48, -96, 64),
        roomSpawn("building:tripwire", -180, 0, 64),
      );
      break;
    case "armory":
      enemies.push(roomSpawn("enemy:police", 0, -120));
      loot.push(roomLoot("item:basic_rifle", -96, 96, "weapon", "rare", 1));
      loot.push(roomLoot("item:sniper_mag", 96, 96, "stackable", "rare", 2));
      break;
    case "trap":
      enemies.push(
        roomSpawn("enemy:police", -160, 0),
        roomSpawn("enemy:stalker", 160, 0),
      );
      buildings.push(
        roomSpawn("building:tripwire", -112, -96, 64),
        spawn("building:tripwire", x, y),
        roomSpawn("building:tripwire", 112, 96, 64),
      );
      loot.push(roomLoot("item:landmine", 0, 128, "stackable", "uncommon", 2));
      break;
    case "mini_boss":
      enemies.push(spawn("enemy:commander", x, y));
      loot.push(roomLoot("item:crossbow", 0, 160, "weapon", "rare", 1));
      loot.push(roomLoot("item:dungeon_key", 96, 160, "stackable", "rare", 2));
      break;
    case "boss":
      enemies.push(
        roomSpawn("enemy:thanos", 0, -80),
        roomSpawn("enemy:megaknight", -220, 160),
        roomSpawn("enemy:sniper", 220, 160),
      );
      enemies.push(
        roomCrate(0, 260, [
          { typeId: "item:thanos_rifle" as ResourceId, kind: "weapon" },
          {
            typeId: "item:blueprint_sniper" as ResourceId,
            kind: "stackable",
            amount: 1,
          },
          {
            typeId: "item:sniper_mag" as ResourceId,
            kind: "stackable",
            amount: 4,
          },
          {
            typeId: "item:hunk" as ResourceId,
            kind: "stackable",
            amount: 20,
          },
        ]),
      );
      break;
  }
}

function dungeonRoomContentPoint(
  room: ProceduralDungeonRoom,
  offsetX: number,
  offsetY: number,
  margin: number,
): ProceduralPoint {
  const minX = Math.min(room.centerX, room.minX + margin);
  const maxX = Math.max(room.centerX, room.maxX - margin);
  const minY = Math.min(room.centerY, room.minY + margin);
  const maxY = Math.max(room.centerY, room.maxY - margin);
  return {
    x: clamp(room.centerX + offsetX, minX, maxX),
    y: clamp(room.centerY + offsetY, minY, maxY),
  };
}

function dungeonRoomLabel(role: DungeonRoomRole): string {
  return role
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function dungeonRoomRisk(role: DungeonRoomRole): ProceduralPoiFeature["risk"] {
  switch (role) {
    case "entrance":
    case "maze":
      return "medium";
    case "mini_boss":
      return "high";
    case "boss":
      return "boss";
    default:
      return "high";
  }
}

function addDungeonArchitecture(
  structures: ProceduralSpawnSpec[],
  buildings: ProceduralSpawnSpec[],
  dungeon: ProceduralDungeonPlan,
): void {
  structures.push({
    typeId: "structure:dungeon" as ResourceId,
    x: snap((dungeon.minX + dungeon.maxX) / 2),
    y: snap((dungeon.minY + dungeon.maxY) / 2),
    hitboxRects: dungeon.wallHitboxRects,
  });
  buildings.push(...dungeon.doors);
}

function addMilitaryBaseFeatures(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  archetype: SectorArchetype,
  center: ProceduralPoint,
): void {
  const specs = [
    [
      "military_checkpoint",
      "Main Checkpoint",
      "checkpoint",
      -680,
      -520,
      420,
      260,
      "medium",
      false,
      "route",
    ],
    [
      "military_barracks",
      "Barracks",
      "barracks",
      -420,
      160,
      520,
      360,
      "medium",
      false,
      "major",
    ],
    [
      "military_command",
      "Command Center",
      "command_center",
      0,
      -340,
      520,
      420,
      "high",
      true,
      "major",
    ],
    [
      "military_armory_vault",
      "Armory Vault",
      "armory_vault",
      420,
      -120,
      420,
      320,
      "boss",
      true,
      "reward",
    ],
    [
      "military_motor_pool",
      "Motor Pool",
      "motor_pool",
      520,
      360,
      520,
      300,
      "medium",
      true,
      "major",
    ],
    [
      "military_comms",
      "Radar Comms",
      "comms",
      0,
      420,
      380,
      320,
      "high",
      true,
      "major",
    ],
    [
      "military_training_yard",
      "Training Yard",
      "training_yard",
      -620,
      470,
      520,
      320,
      "medium",
      false,
      "major",
    ],
    [
      "military_watch_tower_nw",
      "Northwest Watch Tower",
      "watch_tower",
      -760,
      -760,
      220,
      220,
      "high",
      false,
      "major",
    ],
    [
      "military_watch_tower_se",
      "Southeast Watch Tower",
      "watch_tower",
      760,
      760,
      220,
      220,
      "high",
      false,
      "major",
    ],
  ] as const;
  for (const [
    id,
    label,
    role,
    dx,
    dy,
    width,
    height,
    risk,
    hasReward,
    importance,
  ] of specs) {
    addFeature(
      features,
      markers,
      id,
      label,
      role,
      archetype,
      center.x + dx,
      center.y + dy,
      width,
      height,
      risk,
      hasReward,
      importance,
      true,
    );
  }
}

function addForestFeatures(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  archetype: SectorArchetype,
  center: ProceduralPoint,
): void {
  const specs = [
    [
      "forest_main_trail",
      "Main Trail",
      "trail",
      -520,
      0,
      1000,
      160,
      "medium",
      false,
      "route",
    ],
    [
      "forest_hunter_cabin",
      "Hunter Cabin",
      "cabin",
      -440,
      360,
      360,
      280,
      "medium",
      true,
      "major",
    ],
    [
      "forest_south_camp",
      "South Camp",
      "camp",
      180,
      520,
      420,
      280,
      "medium",
      true,
      "major",
    ],
    [
      "forest_pond",
      "Pond",
      "pond",
      520,
      120,
      420,
      340,
      "medium",
      false,
      "major",
    ],
    [
      "forest_bridge",
      "Old Bridge",
      "bridge",
      260,
      -260,
      460,
      160,
      "high",
      false,
      "route",
    ],
    [
      "forest_shrine",
      "Forest Shrine",
      "shrine",
      420,
      -260,
      360,
      300,
      "high",
      true,
      "major",
    ],
    [
      "forest_hidden_cache",
      "Hidden Cache",
      "hidden_cache",
      -650,
      -420,
      300,
      220,
      "high",
      true,
      "reward",
    ],
    [
      "forest_predator_clearing",
      "Predator Clearing",
      "predator_clearing",
      720,
      -580,
      460,
      360,
      "boss",
      true,
      "major",
    ],
  ] as const;
  for (const [
    id,
    label,
    role,
    dx,
    dy,
    width,
    height,
    risk,
    hasReward,
    importance,
  ] of specs) {
    addFeature(
      features,
      markers,
      id,
      label,
      role,
      archetype,
      center.x + dx,
      center.y + dy,
      width,
      height,
      risk,
      hasReward,
      importance,
      true,
    );
  }
}

function addResidentialFeatures(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  archetype: SectorArchetype,
  center: ProceduralPoint,
): void {
  addFeature(
    features,
    markers,
    `${archetype}_residential_block`,
    "Residential Block",
    "residential_block",
    archetype,
    center.x,
    center.y + 640,
    1280,
    860,
    "medium",
    true,
    "major",
    true,
  );
  addFeature(
    features,
    markers,
    `${archetype}_ruin_cluster`,
    "Ruin Cluster",
    "ruin_cluster",
    archetype,
    center.x + 520,
    center.y + 480,
    640,
    440,
    "high",
    true,
    "reward",
    false,
  );
}

function addWildlandFeatures(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  archetype: SectorArchetype,
  center: ProceduralPoint,
): void {
  addFeature(
    features,
    markers,
    `${archetype}_shore_trail`,
    "Shore Trail",
    "trail",
    archetype,
    center.x - 420,
    center.y,
    980,
    160,
    "medium",
    false,
    "route",
    true,
  );
  addFeature(
    features,
    markers,
    `${archetype}_pond_crossing`,
    "Water Crossing",
    "bridge",
    archetype,
    center.x + 420,
    center.y - 160,
    520,
    260,
    "high",
    true,
    "major",
    true,
  );
  addFeature(
    features,
    markers,
    `${archetype}_hidden_cache`,
    "Hidden Cache",
    "hidden_cache",
    archetype,
    center.x - 540,
    center.y + 420,
    320,
    240,
    "high",
    true,
    "reward",
    false,
  );
}

function addIndustrialFeatures(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  archetype: SectorArchetype,
  center: ProceduralPoint,
): void {
  addFeature(
    features,
    markers,
    `${archetype}_industrial_yard`,
    "Industrial Yard",
    "industrial_yard",
    archetype,
    center.x,
    center.y,
    1100,
    840,
    "high",
    true,
    "major",
    true,
  );
  addFeature(
    features,
    markers,
    `${archetype}_resource_pit`,
    "Resource Pit",
    "resource_pit",
    archetype,
    center.x - 520,
    center.y + 480,
    560,
    420,
    "high",
    true,
    "reward",
    false,
  );
}

function addFeature(
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  id: string,
  label: string,
  role: ProceduralPoiFeature["role"],
  archetype: SectorArchetype,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  risk: ProceduralPoiFeature["risk"],
  hasReward: boolean,
  importance: ProceduralMapMarker["importance"],
  discoveredByDefault: boolean,
): void {
  const center = snapPoint({ x: centerX, y: centerY });
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  features.push({
    id,
    label,
    role,
    center,
    minX: snap(center.x - halfWidth),
    minY: snap(center.y - halfHeight),
    maxX: snap(center.x + halfWidth),
    maxY: snap(center.y + halfHeight),
    risk,
    hasReward,
  });
  markers.push(
    marker(
      id,
      label,
      archetype,
      center.x,
      center.y,
      importance,
      discoveredByDefault,
    ),
  );
}

function addMilitaryFence(
  structures: ProceduralSpawnSpec[],
  center: ProceduralPoint,
  width: number,
  height: number,
): void {
  const gateHalfSpan = 260;
  for (let x = center.x - width / 2; x <= center.x + width / 2; x += 384) {
    if (Math.abs(x - center.x) > gateHalfSpan) {
      structures.push(spawn("structure:fence_h", x, center.y - height / 2));
      structures.push(spawn("structure:fence_h", x, center.y + height / 2));
    }
  }
  for (let y = center.y - height / 2; y <= center.y + height / 2; y += 384) {
    if (Math.abs(y - center.y) > gateHalfSpan) {
      structures.push(spawn("structure:fence_v", center.x - width / 2, y));
      structures.push(spawn("structure:fence_v", center.x + width / 2, y));
    }
  }
}

function addHouseCluster(
  structures: ProceduralSpawnSpec[],
  centerX: number,
  centerY: number,
  count: number,
): void {
  const offsets = [
    [-420, -300, "structure:house_l"],
    [0, -280, "structure:house_xl"],
    [420, -260, "structure:house_l"],
    [-360, 220, "structure:house_m"],
    [120, 280, "structure:house_l"],
    [520, 220, "structure:house_m"],
  ] as const;
  for (const [dx, dy, typeId] of offsets.slice(0, count)) {
    structures.push(spawn(typeId, centerX + dx, centerY + dy));
  }
}

function addForest(
  structures: ProceduralSpawnSpec[],
  rng: seedrandom.PRNG,
  rect: ProceduralRect,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    structures.push(
      spawn(
        "structure:tree",
        rect.minX + 180 + rng() * (rect.maxX - rect.minX - 360),
        rect.minY + 180 + rng() * (rect.maxY - rect.minY - 360),
      ),
    );
  }
}

function addPerimeterRoutes(
  structures: ProceduralSpawnSpec[],
  rect: ProceduralRect,
): void {
  const midX = (rect.minX + rect.maxX) / 2;
  const midY = (rect.minY + rect.maxY) / 2;
  structures.push(
    spawn("structure:fence_h", midX - 640, midY - 64),
    spawn("structure:fence_h", midX + 640, midY + 64),
    spawn("structure:fence_v", midX - 64, midY + 640),
    spawn("structure:fence_v", midX + 64, midY - 640),
  );
}

function sectorRect(row: number, col: number): ProceduralRect {
  return {
    minX: col * PROCEDURAL_SECTOR_SIZE,
    minY: row * PROCEDURAL_SECTOR_SIZE,
    maxX: (col + 1) * PROCEDURAL_SECTOR_SIZE,
    maxY: (row + 1) * PROCEDURAL_SECTOR_SIZE,
  };
}

function insetRect(rect: ProceduralRect, inset: number): ProceduralRect {
  return {
    minX: rect.minX + inset,
    minY: rect.minY + inset,
    maxX: rect.maxX - inset,
    maxY: rect.maxY - inset,
  };
}

function requireSector(
  sectors: readonly ProceduralSector[],
  archetype: SectorArchetype,
): ProceduralSector {
  const sector = sectors.find((candidate) => candidate.archetype === archetype);
  if (!sector) {
    throw new Error(`Missing sector archetype ${archetype}.`);
  }
  return sector;
}

function adjacentSectorIds(row: number, col: number): string[] {
  const ids: string[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (
      nextRow >= 0 &&
      nextRow < PROCEDURAL_GRID_SIZE &&
      nextCol >= 0 &&
      nextCol < PROCEDURAL_GRID_SIZE
    ) {
      ids.push(sectorKey(nextRow, nextCol));
    }
  }
  return ids;
}
function shuffle<T>(rng: seedrandom.PRNG, values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    const current = values[index]!;
    values[index] = values[other]!;
    values[other] = current;
  }
  return values;
}

function marker(
  id: string,
  label: string,
  archetype: SectorArchetype,
  x: number,
  y: number,
  importance: ProceduralMapMarker["importance"],
  discoveredByDefault: boolean,
): ProceduralMapMarker {
  return {
    id,
    label,
    archetype,
    x: snap(x),
    y: snap(y),
    importance,
    discoveredByDefault,
  };
}

function spawn(typeId: string, x: number, y: number): ProceduralSpawnSpec {
  return { typeId: typeId as ResourceId, x: snap(x), y: snap(y) };
}

function crateSpawn(
  typeId: string,
  x: number,
  y: number,
  crateLoot: ProceduralCrateLootSlot[],
): ProceduralSpawnSpec {
  return {
    typeId: typeId as ResourceId,
    x: snap(x),
    y: snap(y),
    crateLoot,
  };
}

function lootSpec(
  typeId: string,
  x: number,
  y: number,
  kind: ProceduralLootSpec["kind"],
  rewardTier: ProceduralLootSpec["rewardTier"],
  amount = 1,
): ProceduralLootSpec {
  return {
    typeId: typeId as ResourceId,
    x: snap(x),
    y: snap(y),
    kind,
    rewardTier,
    amount,
  };
}

function snapPoint(point: ProceduralPoint): ProceduralPoint {
  return { x: snap(point.x), y: snap(point.y) };
}

function snap(value: number): number {
  return (
    Math.floor(value / PROCEDURAL_TILE_SIZE) * PROCEDURAL_TILE_SIZE +
    PROCEDURAL_TILE_SIZE / 2
  );
}

function snapEdge(value: number): number {
  return Math.floor(value / PROCEDURAL_TILE_SIZE) * PROCEDURAL_TILE_SIZE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelForArchetype(archetype: SectorArchetype): string {
  return archetype
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function isWeaponLoot(typeId: ResourceId): boolean {
  return [
    "item:basic_spear",
    "item:lead_pipe",
    "item:basic_rifle",
    "item:crossbow",
    "item:sniper",
    "item:drone_shooter",
  ].includes(typeId);
}

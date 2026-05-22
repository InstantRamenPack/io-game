import seedrandom from "seedrandom";
import {
  getAllEntityContentEntries,
  getAllItemContentEntries,
  getEntityContent,
  getWeaponContent,
} from "@shared/content/catalog.ts";
import type { RarityTier } from "@shared/content/schema.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import proceduralContentJson from "@shared/world/procedural-content.json";
import { worldgenConfig } from "@shared/config/gameplayConfig.ts";

export const PROCEDURAL_WORLD_SEED = worldgenConfig.seed;
export const PROCEDURAL_GRID_SIZE = worldgenConfig.gridSize;
export const PROCEDURAL_SECTOR_BANDS = worldgenConfig.sectorBands;
export const PROCEDURAL_SECTOR_SIZE = PROCEDURAL_SECTOR_BANDS[0]!;
export const PROCEDURAL_WORLD_SIZE = {
  w: PROCEDURAL_SECTOR_BANDS.reduce((total, size) => total + size, 0),
  h: PROCEDURAL_SECTOR_BANDS.reduce((total, size) => total + size, 0),
} as const;
export const PROCEDURAL_TILE_SIZE = worldgenConfig.tileSize;
export const PROCEDURAL_TARGET_VILLAGE_COUNT =
  worldgenConfig.targetVillageCount;

export type DungeonRoomRole =
  | "entrance"
  | "combat"
  | "enemy_swarm"
  | "treasure"
  | "maze"
  | "trap"
  | "armory"
  | "mini_boss"
  | "boss";

export const REQUIRED_DUNGEON_ROOM_ROLES =
  worldgenConfig.requiredDungeonRoomRoles as readonly DungeonRoomRole[];

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
  rotation?: number;
  hitboxRects?: Array<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  }>;
  crateLoot?: ProceduralCrateLootSlot[];
};

export type ProceduralVillageKind =
  | "civilian"
  | "scavenger"
  | "military"
  | "extraction_fortified";

export type ProceduralVillagePoiRole =
  | "house"
  | "house_cluster"
  | "market"
  | "checkpoint"
  | "camp"
  | "supply_cache"
  | "armory"
  | "barracks"
  | "motor_pool"
  | "command_post"
  | "helipad";

export type ProceduralVillagePlan = ProceduralRect & {
  id: string;
  sectorId: string;
  kind: ProceduralVillageKind;
  center: ProceduralPoint;
  danger: "low" | "medium" | "high" | "boss";
  lootTier: ProceduralLootSpec["rewardTier"];
  poiRoles: ProceduralVillagePoiRole[];
};

export type ProceduralForestCamp = ProceduralPoint & {
  id: string;
  sectorId: string;
  radius: number;
  enemyTypes: ResourceId[];
  minGroupSize: number;
  maxGroupSize: number;
  maxAlive: number;
  respawnDelayTicks: number;
};

export type ProceduralLootSpec = ProceduralPoint & {
  typeId: ResourceId;
  amount?: number;
  kind: "stackable" | "weapon";
  rewardTier: ProceduralRewardTier;
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
    | "village"
    | "village_house"
    | "village_market"
    | "village_checkpoint"
    | "village_camp"
    | "village_supply_cache"
    | "village_armory"
    | "village_motor_pool"
    | "village_command_post"
    | "village_helipad"
    | "forest_spawn_camp"
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
  hallways: ProceduralRect[];
  entrances: ProceduralDungeonEntrance[];
  wallHitboxRects: NonNullable<ProceduralSpawnSpec["hitboxRects"]>;
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
  villages: ProceduralVillagePlan[];
  forestCamps: ProceduralForestCamp[];
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
  villages: ProceduralVillagePlan[];
  forestCamps: ProceduralForestCamp[];
  minimapMarkers: ProceduralMapMarker[];
};

type ProceduralContentSpawn = {
  typeId: string;
  offsetX: number;
  offsetY: number;
  margin?: number;
  orientation?: "horizontal" | "vertical";
};

type ProceduralContentLoot = ProceduralContentSpawn & {
  kind: ProceduralLootSpec["kind"];
  rewardTier: ProceduralLootSpec["rewardTier"];
  amount: number;
};

type ProceduralContentCrate = {
  offsetX: number;
  offsetY: number;
  loot: Array<{
    typeId: string;
    kind: ProceduralCrateLootSlot["kind"];
    amount?: number;
  }>;
};

type ProceduralRewardTier = Exclude<RarityTier, "legendary">;
type RarityWeightTable = Partial<Record<RarityTier, number>>;

type ProceduralDungeonRoomContent = {
  enemies?: ProceduralContentSpawn[];
  buildings?: ProceduralContentSpawn[];
  loot?: ProceduralContentLoot[];
  crates?: ProceduralContentCrate[];
};

type ProceduralSectorContent = {
  enemies?: ProceduralContentSpawn[];
  buildings?: ProceduralContentSpawn[];
  loot?: ProceduralContentLoot[];
};

type ProceduralContent = {
  lootByTier: Record<ProceduralRewardTier, readonly ResourceId[]>;
  crateLootByTier: Record<
    ProceduralRewardTier,
    readonly ProceduralCrateLootSlot[]
  >;
  forestCampEnemyTypes: {
    corner: readonly ResourceId[];
    edge: readonly ResourceId[];
  };
  villageEnemyPools: Record<ProceduralVillageKind, readonly ResourceId[]>;
  villageEnemyRarityWeights: Record<ProceduralRewardTier, RarityWeightTable>;
  dungeonEnemyRarityWeights: Record<DungeonRoomRole, RarityWeightTable>;
  interiorSpawnChances: {
    furniture: number;
    crate: number;
    enemy: number;
  };
  sectorContent: Partial<Record<SectorArchetype, ProceduralSectorContent>>;
  dungeonRoomContent: Record<DungeonRoomRole, ProceduralDungeonRoomContent>;
  villageRoomTemplates: Record<
    ProceduralVillageKind,
    Record<ProceduralVillagePoiRole, readonly VillageRoomTemplate[]>
  >;
};

const PROCEDURAL_CONTENT = proceduralContentJson as ProceduralContent;

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
  "farmstead",
  "wreckage_field",
  "roadside_village",
];

const DUNGEON_HALLWAY_WIDTH = 96;
const DUNGEON_FILL_CELL_SIZE = 32;
const LOOT_BY_TIER = PROCEDURAL_CONTENT.lootByTier;
const ENEMY_TYPE_IDS_BY_RARITY = buildEnemyTypeIdsByRarity();
const EPIC_BLUEPRINT_TYPE_IDS = getEpicBlueprintTypeIds();

function buildEnemyTypeIdsByRarity(): Record<RarityTier, ResourceId[]> {
  const result: Record<RarityTier, ResourceId[]> = {
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    legendary: [],
  };
  for (const [typeId, content] of getAllEntityContentEntries()) {
    if (!typeId.startsWith("enemy:") || !content.rarityTier) {
      continue;
    }
    if (typeId === "enemy:crate") {
      continue;
    }
    result[content.rarityTier].push(typeId);
  }
  return result;
}

function getEpicBlueprintTypeIds(): ResourceId[] {
  return getAllItemContentEntries()
    .filter(([, item]) => {
      if (!item.unlocksRecipeTypeId) {
        return false;
      }
      const unlockedItem = getAllItemContentEntries().find(
        ([typeId]) => typeId === item.unlocksRecipeTypeId,
      )?.[1];
      return (
        unlockedItem?.weapon !== undefined && unlockedItem.rarityTier === "epic"
      );
    })
    .map(([typeId]) => typeId);
}

function addSectorAuthoredContent(
  archetype: SectorArchetype,
  center: ProceduralPoint,
  buildings: ProceduralSpawnSpec[],
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
): void {
  const content = PROCEDURAL_CONTENT.sectorContent[archetype];
  if (!content) {
    return;
  }

  for (const building of content.buildings ?? []) {
    buildings.push(
      spawn(
        building.typeId,
        center.x + building.offsetX,
        center.y + building.offsetY,
      ),
    );
  }
  for (const enemy of content.enemies ?? []) {
    enemies.push(
      spawn(enemy.typeId, center.x + enemy.offsetX, center.y + enemy.offsetY),
    );
  }
  for (const lootEntry of content.loot ?? []) {
    loot.push(
      lootSpec(
        lootEntry.typeId,
        center.x + lootEntry.offsetX,
        center.y + lootEntry.offsetY,
        lootEntry.kind,
        lootEntry.rewardTier,
        lootEntry.amount,
      ),
    );
  }
}

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

  const availableNonSpecial = shuffle(rng, [...EDGE_COORDS, ...cornerCoords]);
  const militaryCoord = availableNonSpecial.shift();
  const forestCoord = availableNonSpecial.shift();
  if (militaryCoord) {
    assigned.set(sectorKey(militaryCoord.row, militaryCoord.col), "military");
  }
  if (forestCoord) {
    assigned.set(sectorKey(forestCoord.row, forestCoord.col), "forest");
  }

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
  const villages = sectors.flatMap((sector) => sector.villages);
  placeEpicBlueprintCrates(sectors, villages);
  const forestCamps = sectors.flatMap((sector) => sector.forestCamps);
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
    militarySectorId: militaryCoord
      ? sectorKey(militaryCoord.row, militaryCoord.col)
      : extractionSector.id,
    forestSectorId: forestCoord
      ? sectorKey(forestCoord.row, forestCoord.col)
      : extractionSector.id,
    homeBounds,
    extraction,
    dungeon,
    villages,
    forestCamps,
    minimapMarkers,
  };
}

function placeEpicBlueprintCrates(
  sectors: ProceduralSector[],
  villages: readonly ProceduralVillagePlan[],
): void {
  if (EPIC_BLUEPRINT_TYPE_IDS.length === 0) {
    return;
  }
  const worldCenter = proceduralWorldCenter();
  const farVillages = [...villages]
    .filter((village) => village.lootTier !== "common")
    .sort(
      (left, right) =>
        distanceSquared(
          right.center.x,
          right.center.y,
          worldCenter.x,
          worldCenter.y,
        ) -
        distanceSquared(
          left.center.x,
          left.center.y,
          worldCenter.x,
          worldCenter.y,
        ),
    );
  if (farVillages.length === 0) {
    return;
  }

  for (let index = 0; index < EPIC_BLUEPRINT_TYPE_IDS.length; index += 1) {
    const village = farVillages[index % farVillages.length]!;
    const sector = sectors.find(
      (candidate) => candidate.id === village.sectorId,
    );
    if (!sector) {
      continue;
    }
    const angle = (Math.PI * 2 * index) / EPIC_BLUEPRINT_TYPE_IDS.length;
    sector.enemies.push(
      crateSpawn(
        "enemy:crate",
        clamp(
          village.center.x + Math.cos(angle) * 180,
          village.minX + 96,
          village.maxX - 96,
        ),
        clamp(
          village.center.y + Math.sin(angle) * 180,
          village.minY + 96,
          village.maxY - 96,
        ),
        [
          { typeId: "item:hunk" as ResourceId, kind: "stackable", amount: 12 },
          {
            typeId: EPIC_BLUEPRINT_TYPE_IDS[index]!,
            kind: "stackable",
            amount: 1,
          },
        ],
      ),
    );
  }
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
  const villages: ProceduralVillagePlan[] = [];
  const forestCamps: ProceduralForestCamp[] = [];
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

  if (archetype === "home") {
    addSectorAuthoredContent(archetype, center, buildings, enemies, loot);
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
  } else if (archetype === "extraction") {
    addSectorAuthoredContent(archetype, center, buildings, enemies, loot);
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
    const extractionVillage = createVillagePlan(
      rng,
      sectorKey(row, col),
      "extraction_fortified",
      rect,
      center,
      isCornerCoord(row, col),
      0,
    );
    villages.push(extractionVillage);
    addVillageContent(
      rng,
      archetype,
      extractionVillage,
      structures,
      enemies,
      loot,
      features,
      markers,
    );
    addMilitaryFence(structures, center, 960, 720);
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
  } else {
    addVillageAndForestSectorContent(
      rng,
      archetype,
      rect,
      center,
      sectorKey(row, col),
      isCornerCoord(row, col),
      structures,
      enemies,
      loot,
      features,
      markers,
      villages,
      forestCamps,
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
  const keptParentKeys = new Set(
    staticSpawns.map((spec) => `${spec.typeId}@${spec.x},${spec.y}`),
  );
  const filteredStructures = staticSpawns.filter((spec) => {
    const parentKey = interiorParentKeyFromLabel(spec.label);
    return parentKey === null || keptParentKeys.has(parentKey);
  });
  const structureTypeIds = new Set(
    structures.map((structure) => structure.typeId),
  );
  const filteredEnemies = enemies.filter((spec) => {
    const parentKey = interiorParentKeyFromLabel(spec.label);
    return parentKey === null || keptParentKeys.has(parentKey);
  });

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
    structures: filteredStructures.filter((spec) =>
      structureTypeIds.has(spec.typeId),
    ),
    buildings: filteredStructures.filter(
      (spec) => !structureTypeIds.has(spec.typeId),
    ),
    enemies: filteredEnemies,
    loot,
    features,
    minimapMarkers: markers,
    villages,
    forestCamps,
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
  if (spec.hitboxRects) {
    return resolveHitboxRects(spec.x, spec.y, spec.hitboxRects);
  }
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

function canPlaceInsideStructure(
  candidate: ProceduralSpawnSpec,
  structure: ProceduralSpawnSpec,
): boolean {
  const candidateHitboxes = resolveSpawnHitboxes(candidate);
  const structureHitboxes = resolveSpawnHitboxes(structure);
  if (!candidateHitboxes || !structureHitboxes) {
    return false;
  }
  const structureBounds = boundsForResolvedHitboxes(structureHitboxes);
  const candidateBounds = boundsForResolvedHitboxes(candidateHitboxes);
  return (
    candidateBounds.minX >= structureBounds.minX &&
    candidateBounds.maxX <= structureBounds.maxX &&
    candidateBounds.minY >= structureBounds.minY &&
    candidateBounds.maxY <= structureBounds.maxY &&
    !doResolvedRectSetsOverlap(candidateHitboxes, structureHitboxes)
  );
}

function isEnterableHouseType(typeId: ResourceId): boolean {
  return (
    typeId === "structure:house_s" ||
    typeId === "structure:house_m" ||
    typeId === "structure:house_l" ||
    typeId === "structure:house_xl"
  );
}

function doorwayClearanceRect(
  structure: ProceduralSpawnSpec,
): ProceduralRect | null {
  if (!isEnterableHouseType(structure.typeId)) {
    return null;
  }
  const hitboxes = resolveSpawnHitboxes(structure);
  if (!hitboxes) {
    return null;
  }
  const bounds = boundsForResolvedHitboxes(hitboxes);
  const laneHalfWidth = 48;
  const laneDepth = 112;
  const rotation = structure.rotation ?? 0;
  const cos = Math.round(Math.cos(rotation));
  const sin = Math.round(Math.sin(rotation));
  if (cos === 1 && sin === 0) {
    return {
      minX: structure.x - laneHalfWidth,
      maxX: structure.x + laneHalfWidth,
      minY: bounds.maxY - laneDepth,
      maxY: bounds.maxY,
    };
  }
  if (cos === 0 && sin === 1) {
    return {
      minX: bounds.minX,
      maxX: bounds.minX + laneDepth,
      minY: structure.y - laneHalfWidth,
      maxY: structure.y + laneHalfWidth,
    };
  }
  if (cos === -1 && sin === 0) {
    return {
      minX: structure.x - laneHalfWidth,
      maxX: structure.x + laneHalfWidth,
      minY: bounds.minY,
      maxY: bounds.minY + laneDepth,
    };
  }
  return {
    minX: bounds.maxX - laneDepth,
    maxX: bounds.maxX,
    minY: structure.y - laneHalfWidth,
    maxY: structure.y + laneHalfWidth,
  };
}

function overlapsAcceptedInteriorSpawns(
  candidate: ProceduralSpawnSpec,
  accepted: readonly ProceduralSpawnSpec[],
): boolean {
  const candidateHitboxes = resolveSpawnHitboxes(candidate);
  if (!candidateHitboxes) {
    return false;
  }
  return accepted.some((existing) => {
    const existingHitboxes = resolveSpawnHitboxes(existing);
    return (
      existingHitboxes !== null &&
      doResolvedRectSetsOverlap(candidateHitboxes, existingHitboxes)
    );
  });
}

function houseInteriorRect(
  structure: ProceduralSpawnSpec,
): ProceduralRect | null {
  if (
    structure.typeId !== "structure:house_s" &&
    structure.typeId !== "structure:house_m" &&
    structure.typeId !== "structure:house_l" &&
    structure.typeId !== "structure:house_xl"
  ) {
    return null;
  }
  const structureHitboxes = resolveSpawnHitboxes(structure);
  if (!structureHitboxes) {
    return null;
  }
  const bounds = boundsForResolvedHitboxes(structureHitboxes);
  return {
    minX: bounds.minX + 16,
    minY: bounds.minY + 16,
    maxX: bounds.maxX - 16,
    maxY: bounds.maxY - 16,
  };
}

function enterableInteriorRect(
  structure: ProceduralSpawnSpec,
): ProceduralRect | null {
  if (
    structure.typeId !== "structure:house_s" &&
    structure.typeId !== "structure:house_m" &&
    structure.typeId !== "structure:house_l" &&
    structure.typeId !== "structure:house_xl" &&
    structure.typeId !== "structure:barracks" &&
    structure.typeId !== "structure:command_post"
  ) {
    return null;
  }
  const structureHitboxes = resolveSpawnHitboxes(structure);
  if (!structureHitboxes) {
    return null;
  }
  const bounds = boundsForResolvedHitboxes(structureHitboxes);
  return {
    minX: bounds.minX + 16,
    minY: bounds.minY + 16,
    maxX: bounds.maxX - 16,
    maxY: bounds.maxY - 16,
  };
}

function isFullyInsideRect(
  candidate: ProceduralSpawnSpec,
  rect: ProceduralRect,
): boolean {
  const candidateHitboxes = resolveSpawnHitboxes(candidate);
  if (!candidateHitboxes) {
    return false;
  }
  const candidateBounds = boundsForResolvedHitboxes(candidateHitboxes);
  return (
    candidateBounds.minX >= rect.minX &&
    candidateBounds.maxX <= rect.maxX &&
    candidateBounds.minY >= rect.minY &&
    candidateBounds.maxY <= rect.maxY
  );
}

function overlapsRect(
  candidate: ProceduralSpawnSpec,
  rect: ProceduralRect,
): boolean {
  const candidateHitboxes = resolveSpawnHitboxes(candidate);
  if (!candidateHitboxes) {
    return false;
  }
  const candidateBounds = boundsForResolvedHitboxes(candidateHitboxes);
  return !(
    candidateBounds.maxX <= rect.minX ||
    candidateBounds.minX >= rect.maxX ||
    candidateBounds.maxY <= rect.minY ||
    candidateBounds.minY >= rect.maxY
  );
}

function boundsForResolvedHitboxes(
  hitboxes: readonly ReturnType<typeof resolveHitboxRects>[number][],
): ProceduralRect {
  return {
    minX: Math.min(...hitboxes.map((hitbox) => hitbox.minX)),
    minY: Math.min(...hitboxes.map((hitbox) => hitbox.minY)),
    maxX: Math.max(...hitboxes.map((hitbox) => hitbox.maxX)),
    maxY: Math.max(...hitboxes.map((hitbox) => hitbox.maxY)),
  };
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
    if (splitVertical) {
      const splitX = snapEdge(leaf.minX + width * splitRatio);
      leaves.push(
        { ...leaf, maxX: splitX - splitGap },
        { ...leaf, minX: splitX + splitGap },
      );
    } else {
      const splitY = snapEdge(leaf.minY + height * splitRatio);
      leaves.push(
        { ...leaf, maxY: splitY - splitGap },
        { ...leaf, minY: splitY + splitGap },
      );
    }
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

  return layouts.map((layout, index) => {
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

function rectsOverlap(left: ProceduralRect, right: ProceduralRect): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
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

function addDungeonRoomContent(
  room: ProceduralDungeonRoom,
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
  buildings: ProceduralSpawnSpec[],
): void {
  const point = (offsetX: number, offsetY: number, margin = 96) =>
    dungeonRoomContentPoint(room, offsetX, offsetY, margin);
  const roomSpawn = (
    typeId: string,
    offsetX: number,
    offsetY: number,
    margin?: number,
    orientation?: ProceduralContentSpawn["orientation"],
  ) => {
    const position = point(offsetX, offsetY, margin);
    if (typeId === "building:tripwire") {
      if (!orientation) {
        throw new Error("procedural tripwire spawn requires orientation");
      }
      return tripwireSpawn(position.x, position.y, orientation);
    }
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

  const content = PROCEDURAL_CONTENT.dungeonRoomContent[room.role];
  const enemyWeights = PROCEDURAL_CONTENT.dungeonEnemyRarityWeights[room.role];
  const roomEnemySpawns: ProceduralSpawnSpec[] = [];
  for (const enemy of content.enemies ?? []) {
    roomEnemySpawns.push(
      roomSpawn(
        selectEnemyTypeIdByRarityWeights(
          seededRng(`${room.id}:${enemy.offsetX}:${enemy.offsetY}:enemy`),
          enemyWeights,
          {
            excludedTypeIds: new Set<ResourceId>([
              "enemy:saboteur",
              "enemy:wallbreaker",
            ]),
          },
        ),
        enemy.offsetX,
        enemy.offsetY,
        enemy.margin,
      ),
    );
  }
  enforcePoliceSupportSpawn(roomEnemySpawns);
  enemies.push(...roomEnemySpawns);
  for (const building of content.buildings ?? []) {
    buildings.push(
      roomSpawn(
        building.typeId,
        building.offsetX,
        building.offsetY,
        building.margin,
        building.orientation,
      ),
    );
  }
  for (const roomLootEntry of content.loot ?? []) {
    loot.push(
      roomLoot(
        roomLootEntry.typeId,
        roomLootEntry.offsetX,
        roomLootEntry.offsetY,
        roomLootEntry.kind,
        roomLootEntry.rewardTier,
        roomLootEntry.amount,
      ),
    );
  }
  for (const crate of content.crates ?? []) {
    enemies.push(
      roomCrate(
        crate.offsetX,
        crate.offsetY,
        crate.loot.map((slot) => ({
          typeId: slot.typeId as ResourceId,
          kind: slot.kind,
          amount: slot.amount,
        })),
      ),
    );
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
}

function addVillageAndForestSectorContent(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  rect: ProceduralRect,
  center: ProceduralPoint,
  sectorId: string,
  isCorner: boolean,
  structures: ProceduralSpawnSpec[],
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
  villages: ProceduralVillagePlan[],
  forestCamps: ProceduralForestCamp[],
): void {
  const villageCount = isCorner ? 2 : archetype === "forest" ? 1 : 1;
  const villageKind = villageKindForArchetype(archetype, isCorner);
  const anchors = createVillageAnchors(rect, center, villageCount);
  anchors.forEach((anchor, index) => {
    const village = createVillagePlan(
      rng,
      sectorId,
      villageKind,
      rect,
      anchor,
      isCorner,
      index,
    );
    villages.push(village);
    addVillageContent(
      rng,
      archetype,
      village,
      structures,
      enemies,
      loot,
      features,
      markers,
    );
  });

  addForest(structures, rng, rect, forestTreeCount(rect, isCorner));
  const campCount = isCorner ? 3 : 2;
  for (let index = 0; index < campCount; index += 1) {
    const camp = createForestCamp(rng, sectorId, rect, index, isCorner);
    forestCamps.push(camp);
    addFeature(
      features,
      markers,
      camp.id,
      "Forest Camp",
      "forest_spawn_camp",
      archetype,
      camp.x,
      camp.y,
      camp.radius * 2,
      camp.radius * 2,
      isCorner ? "high" : "medium",
      false,
      "route",
      false,
    );
    addInitialForestCampEnemies(rng, camp, enemies);
  }
}

function villageKindForArchetype(
  archetype: SectorArchetype,
  isCorner: boolean,
): ProceduralVillageKind {
  if (archetype === "military") {
    return "military";
  }
  if (
    archetype === "ruined_town" ||
    archetype === "wreckage_field" ||
    archetype === "bunker_edge" ||
    isCorner
  ) {
    return "scavenger";
  }
  return "civilian";
}

function createVillageAnchors(
  rect: ProceduralRect,
  center: ProceduralPoint,
  count: number,
): ProceduralPoint[] {
  if (count === 1) {
    return [center];
  }
  return [
    snapPoint({
      x: rect.minX + (rect.maxX - rect.minX) * 0.34,
      y: rect.minY + (rect.maxY - rect.minY) * 0.38,
    }),
    snapPoint({
      x: rect.minX + (rect.maxX - rect.minX) * 0.68,
      y: rect.minY + (rect.maxY - rect.minY) * 0.66,
    }),
  ];
}

function createVillagePlan(
  rng: seedrandom.PRNG,
  sectorId: string,
  kind: ProceduralVillageKind,
  sector: ProceduralRect,
  anchor: ProceduralPoint,
  isCorner: boolean,
  index: number,
): ProceduralVillagePlan {
  const width = kind === "extraction_fortified" ? 1760 : isCorner ? 1520 : 1180;
  const height = kind === "extraction_fortified" ? 1360 : isCorner ? 1180 : 920;
  const center = snapPoint({
    x: clamp(
      anchor.x + (rng() - 0.5) * 360,
      sector.minX + worldgenConfig.villageCenterMargin.x,
      sector.maxX - worldgenConfig.villageCenterMargin.x,
    ),
    y: clamp(
      anchor.y + (rng() - 0.5) * 360,
      sector.minY + worldgenConfig.villageCenterMargin.y,
      sector.maxY - worldgenConfig.villageCenterMargin.y,
    ),
  });
  const { danger, lootTier } = villageTierForDistance(center);
  const poiRoles = createVillagePoiRoles(kind, isCorner);
  return {
    id: `${sectorId}_village_${index}`,
    sectorId,
    kind,
    center,
    danger,
    lootTier,
    poiRoles,
    minX: snapEdge(center.x - width / 2),
    minY: snapEdge(center.y - height / 2),
    maxX: snapEdge(center.x + width / 2),
    maxY: snapEdge(center.y + height / 2),
  };
}

function villageTierForDistance(
  center: ProceduralPoint,
): Pick<ProceduralVillagePlan, "danger" | "lootTier"> {
  const worldCenter = proceduralWorldCenter();
  const distance = Math.hypot(
    center.x - worldCenter.x,
    center.y - worldCenter.y,
  );
  const { min, max } = possibleVillageCenterDistanceRange();
  const bandWidth = (max - min) / 3;
  if (distance < min + bandWidth) {
    return { danger: "low", lootTier: "common" };
  }
  if (distance < min + bandWidth * 2) {
    return { danger: "medium", lootTier: "uncommon" };
  }
  return { danger: "high", lootTier: "rare" };
}

function possibleVillageCenterDistanceRange(): { min: number; max: number } {
  const worldCenter = proceduralWorldCenter();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (let row = 0; row < PROCEDURAL_GRID_SIZE; row += 1) {
    for (let col = 0; col < PROCEDURAL_GRID_SIZE; col += 1) {
      if (row === 1 && col === 1) {
        continue;
      }
      for (const bounds of possibleVillageCenterRects(row, col)) {
        const closest = snapPoint({
          x: clamp(worldCenter.x, bounds.minX, bounds.maxX),
          y: clamp(worldCenter.y, bounds.minY, bounds.maxY),
        });
        min = Math.min(
          min,
          Math.hypot(closest.x - worldCenter.x, closest.y - worldCenter.y),
        );
        for (const corner of rectCorners(bounds)) {
          const snappedCorner = snapPoint(corner);
          max = Math.max(
            max,
            Math.hypot(
              snappedCorner.x - worldCenter.x,
              snappedCorner.y - worldCenter.y,
            ),
          );
        }
      }
    }
  }

  return { min, max };
}

function possibleVillageCenterRects(
  row: number,
  col: number,
): ProceduralRect[] {
  const sector = sectorRect(row, col);
  const sectorCenter = snapPoint({
    x: (sector.minX + sector.maxX) / 2,
    y: (sector.minY + sector.maxY) / 2,
  });
  const centerBounds = villageCenterBounds(sector);
  const villageCount = isCornerCoord(row, col) ? 2 : 1;
  return createVillageAnchors(sector, sectorCenter, villageCount).map(
    (anchor) => ({
      minX: clamp(anchor.x - 180, centerBounds.minX, centerBounds.maxX),
      minY: clamp(anchor.y - 180, centerBounds.minY, centerBounds.maxY),
      maxX: clamp(anchor.x + 180, centerBounds.minX, centerBounds.maxX),
      maxY: clamp(anchor.y + 180, centerBounds.minY, centerBounds.maxY),
    }),
  );
}

function villageCenterBounds(sector: ProceduralRect): ProceduralRect {
  return {
    minX: sector.minX + worldgenConfig.villageCenterMargin.x,
    minY: sector.minY + worldgenConfig.villageCenterMargin.y,
    maxX: sector.maxX - worldgenConfig.villageCenterMargin.x,
    maxY: sector.maxY - worldgenConfig.villageCenterMargin.y,
  };
}

function proceduralWorldCenter(): ProceduralPoint {
  return {
    x: PROCEDURAL_WORLD_SIZE.w / 2,
    y: PROCEDURAL_WORLD_SIZE.h / 2,
  };
}

function rectCorners(rect: ProceduralRect): ProceduralPoint[] {
  return [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.minX, y: rect.maxY },
    { x: rect.maxX, y: rect.maxY },
  ];
}

function createVillagePoiRoles(
  kind: ProceduralVillageKind,
  isCorner: boolean,
): ProceduralVillagePoiRole[] {
  switch (kind) {
    case "extraction_fortified":
      return [
        "helipad",
        "checkpoint",
        "command_post",
        "armory",
        "motor_pool",
        "house_cluster",
      ];
    case "military":
      return ["checkpoint", "command_post", "armory", "barracks", "motor_pool"];
    case "scavenger":
      return isCorner
        ? ["house_cluster", "market", "camp", "supply_cache", "armory"]
        : ["house_cluster", "market", "camp", "supply_cache"];
    case "civilian":
      return ["house", "house_cluster", "market", "camp", "supply_cache"];
  }
}

function addVillageContent(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  village: ProceduralVillagePlan,
  structures: ProceduralSpawnSpec[],
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
): void {
  addFeature(
    features,
    markers,
    village.id,
    villageLabel(village.kind),
    "village",
    archetype,
    village.center.x,
    village.center.y,
    village.maxX - village.minX,
    village.maxY - village.minY,
    village.danger,
    true,
    "major",
    village.kind === "extraction_fortified",
  );

  const rooms = createBspVillageRooms(rng, village, village.poiRoles);
  for (const room of rooms) {
    addVillagePoiBlock(
      rng,
      archetype,
      village,
      room,
      structures,
      enemies,
      loot,
      features,
      markers,
    );
  }
}

type VillageRoom = ProceduralRect & {
  center: ProceduralPoint;
  role: ProceduralVillagePoiRole;
};

type VillageRoomTemplate = {
  id: string;
  structures?: readonly VillageTemplateStructure[];
  crates?: readonly VillageTemplateOffset[];
  enemies?: readonly VillageTemplateEnemy[];
  loot?: VillageTemplateOffset;
};

type VillageTemplateStructure =
  | (VillageTemplateOffset & {
      typeId: string;
      rotated?: boolean;
      interiorStructures?: readonly VillageTemplateStructureSpawn[];
      interiorCrates?: readonly VillageTemplateOffset[];
      interiorEnemies?: readonly VillageTemplateEnemy[];
    })
  | {
      kind: "fence_box";
      dx: number;
      dy: number;
      width: number;
      height: number;
    };

type VillageTemplateOffset = {
  dx: number;
  dy: number;
};

type VillageTemplateStructureSpawn = VillageTemplateOffset & {
  typeId: string;
};

type VillageTemplateEnemy = VillageTemplateOffset & {
  typeId: string;
};

const VILLAGE_ROOM_TEMPLATES = PROCEDURAL_CONTENT.villageRoomTemplates;
const INTERIOR_SPAWN_CHANCES = PROCEDURAL_CONTENT.interiorSpawnChances;

function createBspVillageRooms(
  rng: seedrandom.PRNG,
  village: ProceduralVillagePlan,
  roles: readonly ProceduralVillagePoiRole[],
): VillageRoom[] {
  const leaves: ProceduralRect[] = [insetRect(village, 96)];
  const target = roles.length;
  while (leaves.length < target) {
    const index = leaves
      .map((leaf, i) => ({
        i,
        area: (leaf.maxX - leaf.minX) * (leaf.maxY - leaf.minY),
      }))
      .sort((a, b) => b.area - a.area)[0]?.i;
    if (index === undefined) {
      break;
    }
    const leaf = leaves.splice(index, 1)[0]!;
    const width = leaf.maxX - leaf.minX;
    const height = leaf.maxY - leaf.minY;
    if (Math.max(width, height) < 520) {
      leaves.push(leaf);
      break;
    }
    const vertical = width > height;
    const ratio = 0.42 + rng() * 0.16;
    if (vertical) {
      const splitX = snapEdge(leaf.minX + width * ratio);
      leaves.push(
        { ...leaf, maxX: splitX - 64 },
        { ...leaf, minX: splitX + 64 },
      );
    } else {
      const splitY = snapEdge(leaf.minY + height * ratio);
      leaves.push(
        { ...leaf, maxY: splitY - 64 },
        { ...leaf, minY: splitY + 64 },
      );
    }
  }
  return leaves.slice(0, roles.length).map((leaf, index) => ({
    ...leaf,
    center: snapPoint({
      x: (leaf.minX + leaf.maxX) / 2,
      y: (leaf.minY + leaf.maxY) / 2,
    }),
    role: roles[index % roles.length]!,
  }));
}

function addVillagePoiBlock(
  rng: seedrandom.PRNG,
  archetype: SectorArchetype,
  village: ProceduralVillagePlan,
  room: VillageRoom,
  structures: ProceduralSpawnSpec[],
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
  features: ProceduralPoiFeature[],
  markers: ProceduralMapMarker[],
): void {
  const roleFeature = villageRoleFeature(room.role);
  addFeature(
    features,
    markers,
    `${village.id}_${room.role}`,
    villagePoiLabel(room.role),
    roleFeature,
    archetype,
    room.center.x,
    room.center.y,
    room.maxX - room.minX,
    room.maxY - room.minY,
    village.danger,
    ["supply_cache", "armory", "market", "helipad"].includes(room.role),
    room.role === "supply_cache" || room.role === "armory" ? "reward" : "route",
    village.kind === "extraction_fortified" && room.role === "helipad",
  );

  const template = selectVillageRoomTemplate(rng, village.kind, room.role);
  applyVillageRoomTemplate(
    rng,
    village,
    room,
    template,
    structures,
    enemies,
    loot,
  );

  addVillageEnemies(rng, village, room, enemies);
}

function villageLabel(kind: ProceduralVillageKind): string {
  switch (kind) {
    case "civilian":
      return "Village";
    case "scavenger":
      return "Scavenger Village";
    case "military":
      return "Military Village";
    case "extraction_fortified":
      return "Fortified Extraction Village";
  }
}

function villagePoiLabel(role: ProceduralVillagePoiRole): string {
  return role
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function villageRoleFeature(
  role: ProceduralVillagePoiRole,
): ProceduralPoiFeature["role"] {
  switch (role) {
    case "house":
    case "house_cluster":
      return "village_house";
    case "market":
      return "village_market";
    case "checkpoint":
      return "village_checkpoint";
    case "camp":
      return "village_camp";
    case "supply_cache":
      return "village_supply_cache";
    case "armory":
      return "village_armory";
    case "barracks":
      return "barracks";
    case "motor_pool":
      return "village_motor_pool";
    case "command_post":
      return "village_command_post";
    case "helipad":
      return "village_helipad";
  }
}

function cardinalRotation(rng: seedrandom.PRNG): number {
  return [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2][Math.floor(rng() * 4)]!;
}

function selectVillageRoomTemplate(
  rng: seedrandom.PRNG,
  kind: ProceduralVillageKind,
  role: ProceduralVillagePoiRole,
): VillageRoomTemplate {
  const templates = VILLAGE_ROOM_TEMPLATES[kind][role];
  return templates[Math.floor(rng() * templates.length)]!;
}

function applyVillageRoomTemplate(
  rng: seedrandom.PRNG,
  village: ProceduralVillagePlan,
  room: VillageRoom,
  template: VillageRoomTemplate,
  structures: ProceduralSpawnSpec[],
  enemies: ProceduralSpawnSpec[],
  loot: ProceduralLootSpec[],
): void {
  for (const structure of template.structures ?? []) {
    if ("kind" in structure) {
      addMilitaryFence(
        structures,
        offsetPoint(room.center, structure.dx, structure.dy),
        structure.width,
        structure.height,
        template.id,
      );
      continue;
    }
    const x = room.center.x + structure.dx;
    const y = room.center.y + structure.dy;
    const rotation = structure.rotated ? cardinalRotation(rng) : 0;
    const structureSpawn = withTemplateLabel(
      structure.rotated
        ? rotatedHouseSpawn(structure.typeId, x, y, rotation)
        : spawn(structure.typeId, x, y),
      template.id,
    );
    const parentKey = `${structureSpawn.typeId}@${structureSpawn.x},${structureSpawn.y}`;
    const doorwayRect = doorwayClearanceRect(structureSpawn);
    const acceptedInteriorSpawns: ProceduralSpawnSpec[] = [];
    structures.push(structureSpawn);
    if (rng() < INTERIOR_SPAWN_CHANCES.furniture) {
      for (const interiorStructure of structure.interiorStructures ?? []) {
        const interiorSpawn = withTemplateLabel(
          spawn(
            interiorStructure.typeId,
            rotatedOffsetX(
              x,
              interiorStructure.dx,
              interiorStructure.dy,
              rotation,
            ),
            rotatedOffsetY(
              y,
              interiorStructure.dx,
              interiorStructure.dy,
              rotation,
            ),
          ),
          template.id,
        );
        interiorSpawn.label = appendInteriorParentKey(
          interiorSpawn.label,
          parentKey,
        );
        const interiorRect = houseInteriorRect(structureSpawn);
        const insideInteriorRect = interiorRect
          ? isFullyInsideRect(interiorSpawn, interiorRect)
          : true;
        if (
          insideInteriorRect &&
          canPlaceInsideStructure(interiorSpawn, structureSpawn) &&
          (!doorwayRect || !overlapsRect(interiorSpawn, doorwayRect)) &&
          !overlapsAcceptedInteriorSpawns(interiorSpawn, acceptedInteriorSpawns)
        ) {
          structures.push(interiorSpawn);
          acceptedInteriorSpawns.push(interiorSpawn);
        }
      }
    }
    if (rng() < INTERIOR_SPAWN_CHANCES.crate) {
      for (const crate of structure.interiorCrates ?? []) {
        const crateSpec = withTemplateLabel(
          crateSpawn(
            "enemy:crate",
            rotatedOffsetX(x, crate.dx, crate.dy, rotation),
            rotatedOffsetY(y, crate.dx, crate.dy, rotation),
            crateLootForTier(rng, village.lootTier),
          ),
          template.id,
        );
        crateSpec.label = appendInteriorParentKey(crateSpec.label, parentKey);
        if (
          canPlaceInsideStructure(crateSpec, structureSpawn) &&
          (!doorwayRect || !overlapsRect(crateSpec, doorwayRect)) &&
          !overlapsAcceptedInteriorSpawns(crateSpec, acceptedInteriorSpawns)
        ) {
          enemies.push(crateSpec);
          acceptedInteriorSpawns.push(crateSpec);
        }
      }
    }
    if (rng() < INTERIOR_SPAWN_CHANCES.enemy) {
      for (const enemy of structure.interiorEnemies ?? []) {
        const enemySpec = withTemplateLabel(
          spawn(
            enemy.typeId,
            rotatedOffsetX(x, enemy.dx, enemy.dy, rotation),
            rotatedOffsetY(y, enemy.dx, enemy.dy, rotation),
          ),
          template.id,
        );
        enemySpec.label = appendInteriorParentKey(enemySpec.label, parentKey);
        if (
          canPlaceInsideStructure(enemySpec, structureSpawn) &&
          (!doorwayRect || !overlapsRect(enemySpec, doorwayRect)) &&
          !overlapsAcceptedInteriorSpawns(enemySpec, acceptedInteriorSpawns)
        ) {
          enemies.push(enemySpec);
          acceptedInteriorSpawns.push(enemySpec);
        }
      }
    }
  }
  for (const crate of template.crates ?? []) {
    enemies.push(
      withTemplateLabel(
        crateSpawn(
          "enemy:crate",
          room.center.x + crate.dx,
          room.center.y + crate.dy,
          crateLootForTier(rng, village.lootTier),
        ),
        template.id,
      ),
    );
  }
  for (const enemy of template.enemies ?? []) {
    enemies.push(
      withTemplateLabel(
        spawn(enemy.typeId, room.center.x + enemy.dx, room.center.y + enemy.dy),
        template.id,
      ),
    );
  }
  if (template.loot) {
    loot.push(
      villageLoot(
        village,
        room.center.x + template.loot.dx,
        room.center.y + template.loot.dy,
      ),
    );
  }
}

function addVillageEnemies(
  rng: seedrandom.PRNG,
  village: ProceduralVillagePlan,
  room: VillageRoom,
  enemies: ProceduralSpawnSpec[],
): void {
  const baseCount =
    village.danger === "boss" ? 2 : village.danger === "high" ? 1 : 1;
  if (
    village.danger !== "high" &&
    village.danger !== "boss" &&
    (room.role === "house" || room.role === "market")
  ) {
    return;
  }
  if (room.role === "house_cluster" && village.danger === "low") {
    enemies.push(spawn("enemy:drifter", room.center.x, room.center.y));
    return;
  }
  const count =
    room.role === "helipad" || room.role === "armory"
      ? baseCount + 1
      : baseCount;
  const weights =
    PROCEDURAL_CONTENT.villageEnemyRarityWeights[village.lootTier];
  const startIndex = enemies.length;
  for (let index = 0; index < count; index += 1) {
    const typeId = selectEnemyTypeIdByRarityWeights(rng, weights);
    const angle = rng() * Math.PI * 2;
    const radius = 80 + rng() * 180;
    enemies.push(
      spawn(
        typeId,
        clamp(
          room.center.x + Math.cos(angle) * radius,
          room.minX + 64,
          room.maxX - 64,
        ),
        clamp(
          room.center.y + Math.sin(angle) * radius,
          room.minY + 64,
          room.maxY - 64,
        ),
      ),
    );
  }
  enforcePoliceSupportSpawn(enemies, startIndex, enemies.length);
}

function selectEnemyTypeIdByRarityWeights(
  rng: seedrandom.PRNG,
  weights: RarityWeightTable,
  options: {
    excludedTypeIds?: ReadonlySet<ResourceId>;
  } = {},
): ResourceId {
  const weightedTiers = Object.entries(weights)
    .map(([tier, weight]) => ({
      tier: tier as RarityTier,
      weight: Math.max(0, weight ?? 0),
    }))
    .filter(
      ({ tier, weight }) =>
        weight > 0 && ENEMY_TYPE_IDS_BY_RARITY[tier].length > 0,
    );
  const totalWeight = weightedTiers.reduce(
    (total, entry) => total + entry.weight,
    0,
  );
  if (totalWeight <= 0) {
    return (
      ENEMY_TYPE_IDS_BY_RARITY.common[0] ?? ("enemy:drifter" as ResourceId)
    );
  }

  let roll = rng() * totalWeight;
  for (const { tier, weight } of weightedTiers) {
    roll -= weight;
    if (roll <= 0) {
      const pool = ENEMY_TYPE_IDS_BY_RARITY[tier].filter(
        (typeId) => !options.excludedTypeIds?.has(typeId),
      );
      if (pool.length === 0) {
        continue;
      }
      return pool[Math.floor(rng() * pool.length)]!;
    }
  }

  const fallbackPool = ENEMY_TYPE_IDS_BY_RARITY[
    weightedTiers.at(-1)!.tier
  ].filter((typeId) => !options.excludedTypeIds?.has(typeId));
  if (fallbackPool.length === 0) {
    return "enemy:drifter";
  }
  return fallbackPool[Math.floor(rng() * fallbackPool.length)]!;
}

function enforcePoliceSupportSpawn(
  spawns: ProceduralSpawnSpec[],
  startIndex = 0,
  endIndex = spawns.length,
): void {
  const scopedSpawns = spawns.slice(startIndex, endIndex);
  if (scopedSpawns.length <= 1) {
    if (scopedSpawns[0]?.typeId === "enemy:police") {
      spawns[startIndex] = { ...scopedSpawns[0], typeId: "enemy:drifter" };
    }
    return;
  }
  const hasNonPolice = scopedSpawns.some(
    (spawn) => spawn.typeId !== "enemy:police",
  );
  if (hasNonPolice) {
    return;
  }
  spawns[startIndex] = { ...scopedSpawns[0]!, typeId: "enemy:drifter" };
}

function seededRng(seed: string): seedrandom.PRNG {
  return seedrandom(seed);
}

function villageLoot(
  village: ProceduralVillagePlan,
  x: number,
  y: number,
): ProceduralLootSpec {
  const pool = LOOT_BY_TIER[village.lootTier];
  const index =
    Math.abs(Math.imul((x | 0) ^ 0x9e3779b9, (y | 0) ^ 0x85ebca6b)) %
    pool.length;
  const typeId = pool[index]!;
  return lootSpec(
    typeId,
    x,
    y,
    getWeaponContent(typeId) ? "weapon" : "stackable",
    village.lootTier,
    village.lootTier === "common" ? 3 : 1,
  );
}

function crateLootForTier(
  rng: seedrandom.PRNG,
  tier: ProceduralLootSpec["rewardTier"],
): ProceduralCrateLootSlot[] {
  const explicitPool = PROCEDURAL_CONTENT.crateLootByTier[tier];
  const knownTypeIds = new Set(explicitPool.map((slot) => slot.typeId));
  const derivedPool = LOOT_BY_TIER[tier]
    .filter((typeId) => !knownTypeIds.has(typeId))
    .map((typeId) => ({
      typeId,
      kind: getWeaponContent(typeId)
        ? ("weapon" as const)
        : ("stackable" as const),
      amount: getWeaponContent(typeId) ? undefined : 1,
    }));
  const pool = [...explicitPool, ...derivedPool];
  const hunk = pool.find((slot) => slot.typeId === "item:hunk");
  const optionalSlots = pool.filter((slot) => slot.typeId !== "item:hunk");
  const loot: ProceduralCrateLootSlot[] = hunk ? [{ ...hunk }] : [];
  const optionalCount = tier === "common" ? 1 : 2;
  const usedIndexes = new Set<number>();

  while (
    loot.length < optionalCount + Number(Boolean(hunk)) &&
    usedIndexes.size < optionalSlots.length
  ) {
    const index = Math.floor(rng() * optionalSlots.length);
    if (usedIndexes.has(index)) {
      continue;
    }
    usedIndexes.add(index);
    loot.push({ ...optionalSlots[index]! });
  }

  return loot;
}

function forestTreeCount(rect: ProceduralRect, isCorner: boolean): number {
  const area = (rect.maxX - rect.minX) * (rect.maxY - rect.minY);
  return Math.floor(area / (isCorner ? 520_000 : 680_000));
}

function createForestCamp(
  rng: seedrandom.PRNG,
  sectorId: string,
  rect: ProceduralRect,
  index: number,
  isCorner: boolean,
): ProceduralForestCamp {
  return {
    id: `${sectorId}_forest_camp_${index}`,
    sectorId,
    x: snap(rect.minX + 360 + rng() * (rect.maxX - rect.minX - 720)),
    y: snap(rect.minY + 360 + rng() * (rect.maxY - rect.minY - 720)),
    radius: 260,
    enemyTypes: [
      ...(isCorner
        ? PROCEDURAL_CONTENT.forestCampEnemyTypes.corner
        : PROCEDURAL_CONTENT.forestCampEnemyTypes.edge),
    ],
    minGroupSize: 1,
    maxGroupSize: isCorner ? 3 : 2,
    maxAlive: isCorner ? 3 : 2,
    respawnDelayTicks: 20 * 180,
  };
}

function addInitialForestCampEnemies(
  _rng: seedrandom.PRNG,
  _camp: ProceduralForestCamp,
  _enemies: ProceduralSpawnSpec[],
): void {
  // Camps start empty — they fill naturally via the respawn system from wave 2 onward.
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
  templateId?: string,
): void {
  const gateHalfSpan = 260;
  for (let x = center.x - width / 2; x <= center.x + width / 2; x += 384) {
    if (Math.abs(x - center.x) > gateHalfSpan) {
      structures.push(
        withTemplateLabel(
          spawn("structure:fence_h", x, center.y - height / 2),
          templateId,
        ),
      );
      structures.push(
        withTemplateLabel(
          spawn("structure:fence_h", x, center.y + height / 2),
          templateId,
        ),
      );
    }
  }
  for (let y = center.y - height / 2; y <= center.y + height / 2; y += 384) {
    if (Math.abs(y - center.y) > gateHalfSpan) {
      structures.push(
        withTemplateLabel(
          spawn("structure:fence_v", center.x - width / 2, y),
          templateId,
        ),
      );
      structures.push(
        withTemplateLabel(
          spawn("structure:fence_v", center.x + width / 2, y),
          templateId,
        ),
      );
    }
  }
}

function addForest(
  structures: ProceduralSpawnSpec[],
  rng: seedrandom.PRNG,
  rect: ProceduralRect,
  count: number,
): void {
  const houseInteriors = structures
    .map((spec) => enterableInteriorRect(spec))
    .filter((interior): interior is ProceduralRect => interior !== null);
  for (let index = 0; index < count; index += 1) {
    const tree = spawn(
      "structure:tree",
      rect.minX + 180 + rng() * (rect.maxX - rect.minX - 360),
      rect.minY + 180 + rng() * (rect.maxY - rect.minY - 360),
    );
    if (houseInteriors.some((interior) => overlapsRect(tree, interior))) {
      continue;
    }
    structures.push(tree);
  }
}

function sectorRect(row: number, col: number): ProceduralRect {
  const minX = PROCEDURAL_SECTOR_BANDS.slice(0, col).reduce(
    (total, size) => total + size,
    0,
  );
  const minY = PROCEDURAL_SECTOR_BANDS.slice(0, row).reduce(
    (total, size) => total + size,
    0,
  );
  return {
    minX,
    minY,
    maxX: minX + PROCEDURAL_SECTOR_BANDS[col]!,
    maxY: minY + PROCEDURAL_SECTOR_BANDS[row]!,
  };
}

function isCornerCoord(row: number, col: number): boolean {
  return (
    (row === 0 || row === PROCEDURAL_GRID_SIZE - 1) &&
    (col === 0 || col === PROCEDURAL_GRID_SIZE - 1)
  );
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

function tripwireSpawn(
  x: number,
  y: number,
  orientation: "horizontal" | "vertical",
): ProceduralSpawnSpec {
  const horizontal = orientation === "horizontal";
  return {
    typeId: "building:tripwire" as ResourceId,
    x: snap(x),
    y: snap(y),
    rotation: horizontal ? 0 : Math.PI / 2,
    hitboxRects: [
      {
        width: horizontal ? 220 : 16,
        height: horizontal ? 16 : 220,
        offsetX: 0,
        offsetY: 0,
      },
    ],
  };
}

function withTemplateLabel(
  spec: ProceduralSpawnSpec,
  templateId: string | undefined,
): ProceduralSpawnSpec {
  return templateId
    ? { ...spec, label: `village_template:${templateId}` }
    : spec;
}

function appendInteriorParentKey(
  label: string | undefined,
  parentKey: string,
): string {
  return `${label ?? "village_template:unknown"}|interior_parent:${parentKey}`;
}

function interiorParentKeyFromLabel(label: string | undefined): string | null {
  if (!label) {
    return null;
  }
  const marker = "|interior_parent:";
  const index = label.indexOf(marker);
  if (index === -1) {
    return null;
  }
  return label.slice(index + marker.length);
}

function offsetPoint(
  point: ProceduralPoint,
  dx: number,
  dy: number,
): ProceduralPoint {
  return { x: snap(point.x + dx), y: snap(point.y + dy) };
}

function rotatedOffsetX(
  centerX: number,
  dx: number,
  dy: number,
  rotation: number,
): number {
  const cos = Math.round(Math.cos(rotation));
  const sin = Math.round(Math.sin(rotation));
  return centerX + dx * cos - dy * sin;
}

function rotatedOffsetY(
  centerY: number,
  dx: number,
  dy: number,
  rotation: number,
): number {
  const cos = Math.round(Math.cos(rotation));
  const sin = Math.round(Math.sin(rotation));
  return centerY + dx * sin + dy * cos;
}

function rotatedHouseSpawn(
  typeId: string,
  x: number,
  y: number,
  rotation: number,
): ProceduralSpawnSpec {
  const centerX = snap(x);
  const centerY = snap(y);
  const content = getEntityContent(typeId as ResourceId);
  const hitboxes =
    content?.hitboxProfiles?.[content.activeHitboxProfile ?? "default"] ??
    (content?.hitboxProfiles
      ? Object.values(content.hitboxProfiles)[0]
      : undefined);
  if (!hitboxes) {
    return { typeId: typeId as ResourceId, x: centerX, y: centerY, rotation };
  }
  return {
    typeId: typeId as ResourceId,
    x: centerX,
    y: centerY,
    rotation,
    hitboxRects: rotateHitboxRects(hitboxes, rotation),
  };
}

function rotateHitboxRects(
  rects: Readonly<NonNullable<ProceduralSpawnSpec["hitboxRects"]>>,
  rotation: number,
): NonNullable<ProceduralSpawnSpec["hitboxRects"]> {
  const cos = Math.round(Math.cos(rotation));
  const sin = Math.round(Math.sin(rotation));
  return rects.map((rect) => {
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const corners = [
      { x: rect.offsetX - halfW, y: rect.offsetY - halfH },
      { x: rect.offsetX + halfW, y: rect.offsetY - halfH },
      { x: rect.offsetX + halfW, y: rect.offsetY + halfH },
      { x: rect.offsetX - halfW, y: rect.offsetY + halfH },
    ].map((point) => ({
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
    }));
    const minX = Math.min(...corners.map((point) => point.x));
    const maxX = Math.max(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));
    // Cardinal rotations should preserve exact grid geometry; avoid floor-based
    // snapping here so wall endpoints do not lose a tile from FP drift.
    return {
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
      offsetX: Math.round((minX + maxX) / 2),
      offsetY: Math.round((minY + maxY) / 2),
    };
  });
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

function distanceSquared(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function labelForArchetype(archetype: SectorArchetype): string {
  return archetype
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

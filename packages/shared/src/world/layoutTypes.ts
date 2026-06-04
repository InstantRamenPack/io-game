import type { RarityTier } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { worldgenConfig } from "@shared/config/gameplayConfig.ts";

export type ProceduralRewardTier = Exclude<RarityTier, "legendary">;

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
  kind: "item" | "stackable" | "weapon";
};

export type ProceduralMapMarker = ProceduralPoint & {
  id: string;
  label: string;
  archetype: SectorArchetype;
  importance: "sector" | "major" | "reward" | "route";
  discoveredByDefault: boolean;
  risk?: ProceduralPoiFeature["risk"];
  tier?: ProceduralRewardTier;
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

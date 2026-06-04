import type { RarityTier } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import proceduralLootJson from "@shared/world/procedural-loot.json";
import proceduralBlueprintsJson from "@shared/world/procedural-blueprints.json";
import proceduralVillagesJson from "@shared/world/procedural-villages.json";
import proceduralDungeonJson from "@shared/world/procedural-dungeon.json";
import proceduralSectorsJson from "@shared/world/procedural-sectors.json";
import type {
  DungeonRoomRole,
  ProceduralCrateLootSlot,
  ProceduralLootSpec,
  ProceduralRewardTier,
  ProceduralVillageKind,
  ProceduralVillagePoiRole,
  SectorArchetype,
} from "@shared/world/layoutTypes.ts";

type RarityWeightTable = Partial<Record<RarityTier, number>>;

export type ProceduralDungeonEnemySpawn = {
  offsetX: number;
  offsetY: number;
  margin?: number;
  typeId?: string;
  spawnRole?: "legendary_boss";
};

export type ProceduralContentSpawn = {
  typeId: string;
  offsetX: number;
  offsetY: number;
  margin?: number;
  orientation?: "horizontal" | "vertical";
};

export type ProceduralContentLoot = ProceduralContentSpawn & {
  kind: ProceduralLootSpec["kind"];
  rewardTier: ProceduralLootSpec["rewardTier"];
  amount: number;
};

export type ProceduralContentCrate = {
  offsetX: number;
  offsetY: number;
  spawnChance?: number;
  blueprint?: boolean;
  randomLootTier?: ProceduralRewardTier;
  loot?: Array<{
    typeId: string;
    kind: ProceduralCrateLootSlot["kind"];
    amount?: number;
  }>;
};

export type ProceduralDungeonRoomContent = {
  enemies?: ProceduralDungeonEnemySpawn[];
  buildings?: ProceduralContentSpawn[];
  decor?: ProceduralContentSpawn[];
  loot?: ProceduralContentLoot[];
  crates?: ProceduralContentCrate[];
};

export type ProceduralSectorContent = {
  enemies?: ProceduralContentSpawn[];
  buildings?: ProceduralContentSpawn[];
  loot?: ProceduralContentLoot[];
};

export type VillageTemplateOffset = {
  dx: number;
  dy: number;
};

export type VillageTemplateStructureSpawn = VillageTemplateOffset & {
  typeId: string;
};

export type VillageTemplateEnemy = VillageTemplateOffset & {
  typeId: string;
};

export type VillageTemplateStructure =
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

export type VillageRoomTemplate = {
  id: string;
  structures?: readonly VillageTemplateStructure[];
  crates?: readonly VillageTemplateOffset[];
  enemies?: readonly VillageTemplateEnemy[];
  loot?: VillageTemplateOffset;
};

export type ProceduralLootConfig = {
  lootByTier: Record<ProceduralRewardTier, readonly ResourceId[]>;
  crateLootRarityWeights: Record<ProceduralRewardTier, RarityWeightTable>;
};

export type ProceduralBlueprintConfig = {
  blueprintPlacement: {
    villagesPerDistanceTier: number;
    crateRules: {
      itemsPerCrate: number;
      ensureVillageHasCrate: boolean;
    };
    villageTierSlots: Record<
      ProceduralRewardTier | "epic",
      {
        armorBlueprintTypeId?: ResourceId;
        weaponBlueprintPool: string;
        weaponBlueprintCount: number;
        extraWeaponBlueprintPool?: string;
        extraWeaponBlueprintCount?: number;
      }
    >;
    dungeonSlots: {
      rareWeaponBlueprintPool: string;
      rareWeaponBlueprintCount: number;
      epicWeaponBlueprintPool: string;
      epicWeaponBlueprintCount: number;
    };
    weaponBlueprintPools: Record<
      string,
      {
        unlockedRarityTier: RarityTier;
        requireWeapon?: boolean;
        excludeBlueprintTypeIds: readonly ResourceId[];
      }
    >;
  };
};

export type ProceduralVillageConfig = {
  villageGeneration: {
    bspSplitGap: number;
    bspMinLeafAxis: number;
    bspVillageInset: number;
    bspMinPartitionAxis: number;
    bspRingPartitionMinAxis: number;
    sectorEdgeMargin: number;
    extractionVillageHeight: number;
  };
  defaultVillageRoomTemplates?: Record<
    ProceduralVillageKind,
    Record<ProceduralVillagePoiRole, readonly VillageRoomTemplate[]>
  >;
  villageRoomTemplates: Record<
    ProceduralVillageKind,
    Record<ProceduralVillagePoiRole, readonly VillageRoomTemplate[]>
  >;
  villageEnemyPools: Record<ProceduralVillageKind, readonly ResourceId[]>;
  villageEnemyRarityWeights: Record<ProceduralRewardTier, RarityWeightTable>;
};

export type ProceduralDungeonConfig = {
  dungeonRoomContent: Record<DungeonRoomRole, ProceduralDungeonRoomContent>;
  dungeonEnemyRarityWeights: Record<DungeonRoomRole, RarityWeightTable>;
  interiorSpawnChances: {
    furniture: number;
    crate: number;
    enemy: number;
  };
};

export type ProceduralSectorConfig = {
  sectorContent: Partial<Record<SectorArchetype, ProceduralSectorContent>>;
  forestCampEnemyTypes: {
    corner: readonly ResourceId[];
    edge: readonly ResourceId[];
  };
};

export type ProceduralContentConfig = ProceduralLootConfig &
  ProceduralBlueprintConfig &
  ProceduralVillageConfig &
  ProceduralDungeonConfig &
  ProceduralSectorConfig;

const proceduralLoot = proceduralLootJson as ProceduralLootConfig;
const proceduralBlueprints =
  proceduralBlueprintsJson as ProceduralBlueprintConfig;
const proceduralVillages = proceduralVillagesJson as unknown as ProceduralVillageConfig;
const proceduralDungeon = proceduralDungeonJson as ProceduralDungeonConfig;
const proceduralSectors = proceduralSectorsJson as ProceduralSectorConfig;

export const proceduralLootConfig = proceduralLoot;
export const proceduralBlueprintConfig = proceduralBlueprints;
export const proceduralVillageConfig = proceduralVillages;
export const proceduralDungeonConfig = proceduralDungeon;
export const proceduralSectorConfig = proceduralSectors;

export const proceduralContentConfig: ProceduralContentConfig = {
  ...proceduralLoot,
  ...proceduralBlueprints,
  ...proceduralVillages,
  ...proceduralDungeon,
  ...proceduralSectors,
};

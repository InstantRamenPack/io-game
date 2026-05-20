import {
  getAllItemContentEntries,
  getEntityContent,
  getEntityCapabilities,
  getItemContent,
  getItemPickupSpawnPools,
  getItemRecycleHunkValue,
  getWeaponRarityTier,
} from "@shared/content/catalog.ts";
import {
  pickupsConfig,
  recyclingConfig,
} from "@shared/config/gameplayConfig.ts";
import enemyDeathLootBalanceRaw from "@shared/content/death_loot.json";
import type {
  EntityCapabilitiesContent,
  ItemContent,
  PickupSpawnPool,
  RarityTier,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";

export const HUNK_ITEM_TYPE_ID = "item:hunk" as ResourceId;

function getContentTypeIds(
  predicate: (entry: readonly [ResourceId, ItemContent]) => boolean,
): readonly ResourceId[] {
  return Object.freeze(
    getAllItemContentEntries()
      .filter((entry) => predicate(entry))
      .map(([typeId]) => typeId),
  );
}

function getPickupSpawnTypeIds(
  pool: PickupSpawnPool,
  legacyOrder: readonly ResourceId[],
): readonly ResourceId[] {
  const typeIdsByContent = getContentTypeIds(([typeId]) =>
    getItemPickupSpawnPools(typeId).includes(pool),
  );
  const typeIdSet = new Set(typeIdsByContent);
  const orderedTypeIdSet = new Set<ResourceId>(legacyOrder);

  return Object.freeze([
    ...legacyOrder.filter((typeId) => typeIdSet.has(typeId)),
    ...typeIdsByContent.filter((typeId) => !orderedTypeIdSet.has(typeId)),
  ]);
}

export const WORLD_BLUEPRINT_PICKUP_TYPE_IDS = getPickupSpawnTypeIds(
  "blueprint",
  pickupsConfig.legacyOrder.blueprint as readonly ResourceId[],
);

export const WORLD_FOOD_PICKUP_TYPE_IDS = getPickupSpawnTypeIds(
  "food",
  pickupsConfig.legacyOrder.food as readonly ResourceId[],
);

export const WORLD_MAG_PICKUP_TYPE_IDS = getPickupSpawnTypeIds(
  "mag",
  pickupsConfig.legacyOrder.mag as readonly ResourceId[],
);

const WORLD_WEAPON_PICKUP_TYPE_IDS_BY_CONTENT = getPickupSpawnTypeIds(
  "weapon",
  pickupsConfig.legacyOrder.weapon as readonly ResourceId[],
);

export function getWorldWeaponPickupTypeIds(): readonly ResourceId[] {
  return WORLD_WEAPON_PICKUP_TYPE_IDS_BY_CONTENT;
}

export function getRecycleHunkOutput(
  typeId: ResourceId,
  randomNumberGenerator: () => number,
): number | undefined {
  const itemContent = getItemContent(typeId);
  if (!itemContent) {
    return undefined;
  }
  if (
    (itemContent.weapon || itemContent.buildsEntityTypeId) &&
    itemContent.rarityTier
  ) {
    const [min, max] = recyclingConfig.rarityHunkRanges[itemContent.rarityTier];
    return min + Math.floor(randomNumberGenerator() * (max - min + 1));
  }
  return getItemRecycleHunkValue(typeId);
}

type EnemyDeathLootConfig = {
  rarityTier: RarityTier;
};

type TierBalance = {
  weaponDropChance: number;
  hunkMin: number;
  hunkMax: number;
  magDropChance: number;
  magMin: number;
  magMax: number;
};

const ENEMY_DEATH_LOOT_BALANCE = enemyDeathLootBalanceRaw as Record<
  RarityTier,
  TierBalance
>;

const RARITY_TIERS: readonly RarityTier[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

for (const tier of RARITY_TIERS) {
  const value = ENEMY_DEATH_LOOT_BALANCE[tier];
  if (!value) {
    throw new Error(`Missing enemy death loot balance tier: ${tier}`);
  }
}

export function getEnemyDeathLootConfig(
  typeId: ResourceId,
): EnemyDeathLootConfig {
  const content = getEntityContent(typeId);
  if (
    !content ||
    content.deathLoot === undefined ||
    content.rarityTier === undefined
  ) {
    throw new Error(`Enemy ${typeId} is missing required death loot content.`);
  }
  return { rarityTier: content.rarityTier };
}

export function getEnemyDeathHunkDropAmount(
  rarityTier: RarityTier,
  randomNumberGenerator: () => number,
): number {
  const tier = ENEMY_DEATH_LOOT_BALANCE[rarityTier];
  return (
    tier.hunkMin +
    Math.floor(randomNumberGenerator() * (tier.hunkMax - tier.hunkMin + 1))
  );
}

export function shouldDropEnemyWeapon(
  rarityTier: RarityTier,
  randomNumberGenerator: () => number,
): boolean {
  return (
    randomNumberGenerator() <
    ENEMY_DEATH_LOOT_BALANCE[rarityTier].weaponDropChance
  );
}

export function getEnemyDeathMagDropCount(
  rarityTier: RarityTier,
  randomNumberGenerator: () => number,
): number {
  const tier = ENEMY_DEATH_LOOT_BALANCE[rarityTier];
  if (randomNumberGenerator() >= tier.magDropChance) return 0;
  return (
    tier.magMin +
    Math.floor(randomNumberGenerator() * (tier.magMax - tier.magMin + 1))
  );
}

export function requireWeaponRarityTier(typeId: ResourceId): RarityTier {
  const tier = getWeaponRarityTier(typeId);
  if (!tier) {
    throw new Error(`Weapon ${typeId} is missing required rarityTier.`);
  }
  return tier;
}

export function isDebugAdminPlayerName(name: string): boolean {
  return (
    process.env.NODE_ENV !== "production" && name.toLowerCase() === "debug"
  );
}

export function isRecyclerEntity(entity: Entity): boolean {
  return entity instanceof Recycler;
}

export function isCraftingStationEntity(entity: Entity): boolean {
  return getEntityCapabilities(entity.typeId)?.craftingStation === true;
}

export function isContainerEntity(entity: Entity): entity is Chest {
  return (
    getEntityCapabilities(entity.typeId)?.container !== undefined &&
    entity instanceof Chest
  );
}

export function getRepairableCapability(
  entity: Entity,
): EntityCapabilitiesContent["repairable"] | undefined {
  return getEntityCapabilities(entity.typeId)?.repairable;
}

export function requiresManualPickup(typeId: ResourceId): boolean {
  const itemEntry = itemTypeRegistry.get(typeId);
  if (!itemEntry) {
    return false;
  }
  return new itemEntry.ctor().requiresManualPickup();
}

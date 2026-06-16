import {
  getEntityContent,
  getEntityCapabilities,
  getItemContent,
  getItemRecycleHunkValue,
  getWeaponRarityTier,
} from "@shared/content/catalog.ts";
import { recyclingConfig } from "@shared/config/gameplayConfig.ts";
import enemyDeathLootBalanceRaw from "@shared/content/death_loot.json";
import type {
  EntityCapabilitiesContent,
  RarityTier,
} from "@shared/content/schema.ts";
import { RARITY_TIERS } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Hub } from "@server/entities/tower/Hub.ts";
import { Tower } from "@server/entities/tower/Tower.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";

export const HUNK_ITEM_TYPE_ID = "item:hunk" as ResourceId;

type EnemyDeathLootConfig = {
  rarityTier: RarityTier;
  fixedHunks?: number;
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

for (const tier of RARITY_TIERS) {
  const value = ENEMY_DEATH_LOOT_BALANCE[tier];
  if (!value) {
    throw new Error(`Missing enemy death loot balance tier: ${tier}`);
  }
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
  return {
    rarityTier: content.rarityTier,
    fixedHunks: content.deathLoot.fixedHunks,
  };
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
  return getEntityCapabilities(entity.typeId)?.recycler === true;
}

export function isCraftingStationEntity(entity: Entity): boolean {
  return getEntityCapabilities(entity.typeId)?.craftingStation === true;
}

export function isTowerEntity(entity: Entity): entity is Tower {
  return entity instanceof Tower;
}

export function isContainerEntity(entity: Entity): entity is Hub {
  return (
    getEntityCapabilities(entity.typeId)?.container !== undefined &&
    entity instanceof Hub
  );
}

export function getRepairableCapability(
  entity: Entity,
): EntityCapabilitiesContent["repairable"] | undefined {
  return getEntityCapabilities(entity.typeId)?.repairable;
}

export function requiresManualPickup(typeId: ResourceId): boolean {
  const itemEntry = getItemLikeTypeEntry(typeId);
  if (!itemEntry) {
    return false;
  }
  return new itemEntry.ctor().requiresManualPickup();
}

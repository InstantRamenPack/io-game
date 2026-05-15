import {
  getAllItemContentEntries,
  getEntityCapabilities,
  getItemPickupSpawnPools,
  getItemRecycleHunkValue,
} from "@shared/content/catalog.ts";
import type {
  EntityCapabilitiesContent,
  ItemContent,
  PickupSpawnPool,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import { isWeaponCtor } from "@server/runtime/ctorGuards.ts";

export const HUNK_ITEM_TYPE_ID = "item:hunk" as ResourceId;

const WORLD_WEAPON_PICKUP_TYPE_IDS = [
  "item:basic_spear",
  "item:cleaver",
  "item:lead_pipe",
  "item:baseball_bat",
  "item:basic_dagger",
  "item:scissors",
] as const satisfies readonly ResourceId[];

const WORLD_AMMO_SOURCE_WEAPON_TYPE_IDS = [
  "item:pistol_mag",
  "item:rifle_mag",
  "item:crossbow_mag",
  "item:drone_mag",
] as const satisfies readonly ResourceId[];

const WORLD_BLUEPRINT_PICKUP_TYPE_ORDER = [
  "item:blueprint_spiked_spear",
  "item:blueprint_basic_rifle",
  "item:blueprint_katana",
  "item:blueprint_sniper",
] as const satisfies readonly ResourceId[];

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
  WORLD_BLUEPRINT_PICKUP_TYPE_ORDER,
);

export const WORLD_FOOD_PICKUP_TYPE_IDS = getPickupSpawnTypeIds("food", [
  "item:junk_food" as ResourceId,
  "item:quality_food" as ResourceId,
]);

export const WORLD_MAG_PICKUP_TYPE_IDS = getPickupSpawnTypeIds(
  "mag",
  WORLD_AMMO_SOURCE_WEAPON_TYPE_IDS,
);

const WORLD_WEAPON_PICKUP_TYPE_IDS_BY_CONTENT = getPickupSpawnTypeIds(
  "weapon",
  WORLD_WEAPON_PICKUP_TYPE_IDS,
);

export function getWorldWeaponPickupTypeIds(): readonly ResourceId[] {
  return WORLD_WEAPON_PICKUP_TYPE_IDS_BY_CONTENT;
}

export function getRecycleHunkOutput(typeId: ResourceId): number | undefined {
  return getItemRecycleHunkValue(typeId);
}

export function getEnemyDeathHunkDropAmount(
  randomNumberGenerator: () => number,
): number {
  return 3 + Math.floor(randomNumberGenerator() * 12);
}

export function shouldDropAllDeathWeapons(typeId: ResourceId): boolean {
  return typeId === ("enemy:thanos" as ResourceId);
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
  return (
    isWeaponCtor(itemEntry.ctor) ||
    itemEntry.content.buildsEntityTypeId !== undefined
  );
}

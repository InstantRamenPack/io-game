import {
  buildingContentEntries,
  effectContentEntries,
  enemyContentEntries,
  itemContentEntries,
  pickupContentEntries,
  playerContentEntries,
  projectileContentEntries,
  structureContentEntries,
} from "@shared/content/generated/manifest.ts";
import type {
  EffectContent,
  EntityContent,
  ItemContent,
  PlayerStarterLoadout,
  ProjectileContent,
  WeaponContent,
} from "@shared/content/schema.ts";
import {
  getResourcePath,
  isResourceId,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";
import type { JsonObject } from "@shared/json.ts";

const itemContents = new Map<ResourceId, ItemContent>(itemContentEntries);

const entityContents = new Map<ResourceId, EntityContent>([
  ...playerContentEntries,
  ...enemyContentEntries,
  ...buildingContentEntries,
  ...structureContentEntries,
  ...projectileContentEntries,
  ...pickupContentEntries,
]);

const effectContents = new Map<ResourceId, EffectContent>(effectContentEntries);

function serializeEntries<T>(
  entries: ReadonlyArray<readonly [ResourceId, T]>,
): JsonObject[] {
  return entries.map(([typeId, content]) => ({
    typeId,
    content: content as JsonObject,
  }));
}

function requireMapValue<T>(
  contents: ReadonlyMap<ResourceId, T>,
  typeId: ResourceId,
  errorMessage: string,
): T {
  const value = contents.get(typeId);
  if (value === undefined) {
    throw new Error(errorMessage);
  }
  return value;
}

export function sortResourceEntriesByTypeId<T>(
  entries: Iterable<readonly [ResourceId, T]>,
): Array<readonly [ResourceId, T]> {
  return [...entries].sort(([left], [right]) => left.localeCompare(right));
}

function getItemTypeIds(
  predicate: (itemContent: ItemContent) => boolean,
): readonly ResourceId[] {
  return Object.freeze(
    [...itemContents.entries()]
      .filter(([, itemContent]) => predicate(itemContent))
      .map(([typeId]) => typeId),
  );
}

export function getItemContent(typeId: ResourceId): ItemContent | undefined {
  return itemContents.get(typeId);
}

export const CRAFTABLE_ITEM_TYPE_IDS = getItemTypeIds(
  (itemContent) => itemContent.recipe !== undefined,
);

const BLUEPRINT_TYPE_IDS = getItemTypeIds(
  (itemContent) => itemContent.unlocksRecipeTypeId !== undefined,
);

const BLUEPRINT_LOCKED_RECIPE_TYPE_IDS = new Set<ResourceId>(
  BLUEPRINT_TYPE_IDS.map(
    (typeId) =>
      requireMapValue(
        itemContents,
        typeId,
        `Unknown blueprint item content: ${typeId}`,
      ).unlocksRecipeTypeId as ResourceId,
  ),
);

export function getBlueprintUnlockedRecipeTypeId(
  typeId: ResourceId,
): ResourceId | undefined {
  return getItemContent(typeId)?.unlocksRecipeTypeId;
}

export function isBlueprintItemTypeId(typeId: ResourceId): boolean {
  return getBlueprintUnlockedRecipeTypeId(typeId) !== undefined;
}

export function isRecipeBlueprintLocked(typeId: ResourceId): boolean {
  return BLUEPRINT_LOCKED_RECIPE_TYPE_IDS.has(typeId);
}

export function requireItemContent(typeId: ResourceId): ItemContent {
  return requireMapValue(
    itemContents,
    typeId,
    `Unknown item content: ${typeId}`,
  );
}

export function getWeaponContent(
  typeId: ResourceId,
): WeaponContent | undefined {
  return getItemContent(typeId)?.weapon;
}

export function requireWeaponContent(typeId: ResourceId): WeaponContent {
  const weaponContent = getWeaponContent(typeId);
  if (!weaponContent) {
    throw new Error(`Unknown weapon content: ${typeId}`);
  }
  return weaponContent;
}

export function getEntityContent(
  typeId: ResourceId,
): EntityContent | undefined {
  return entityContents.get(typeId);
}

export function requireEntityContent(typeId: ResourceId): EntityContent {
  return requireMapValue(
    entityContents,
    typeId,
    `Unknown entity content: ${typeId}`,
  );
}

export function getProjectileContent(
  typeId: ResourceId,
): ProjectileContent | undefined {
  return getEntityContent(typeId)?.projectile;
}

export function requireProjectileContent(
  typeId: ResourceId,
): ProjectileContent {
  const projectileContent = getProjectileContent(typeId);
  if (!projectileContent) {
    throw new Error(`Unknown projectile content: ${typeId}`);
  }
  return projectileContent;
}

function getPlayerStarterLoadout(
  typeId: ResourceId,
): PlayerStarterLoadout | undefined {
  return getEntityContent(typeId)?.player?.starterLoadout;
}

export function requirePlayerStarterLoadout(
  typeId: ResourceId,
): PlayerStarterLoadout {
  const starterLoadout = getPlayerStarterLoadout(typeId);
  if (!starterLoadout) {
    throw new Error(`Missing player starter loadout content for ${typeId}`);
  }
  return starterLoadout;
}

function getEffectContent(typeId: ResourceId): EffectContent | undefined {
  return effectContents.get(typeId);
}

export function requireEffectContent(typeId: ResourceId): EffectContent {
  return requireMapValue(
    effectContents,
    typeId,
    `Unknown effect content: ${typeId}`,
  );
}

export function getAllItemContentEntries(): Array<
  readonly [ResourceId, ItemContent]
> {
  return sortResourceEntriesByTypeId(itemContents.entries());
}

export function getAllEntityContentEntries(): Array<
  readonly [ResourceId, EntityContent]
> {
  return sortResourceEntriesByTypeId(entityContents.entries());
}

export function getAllEffectContentEntries(): Array<
  readonly [ResourceId, EffectContent]
> {
  return sortResourceEntriesByTypeId(effectContents.entries());
}

export const CONTENT_COMPAT_DESCRIPTOR = Object.freeze({
  items: serializeEntries(getAllItemContentEntries()),
  entities: [
    ...serializeEntries(sortResourceEntriesByTypeId(playerContentEntries)),
    ...serializeEntries(sortResourceEntriesByTypeId(enemyContentEntries)),
    ...serializeEntries(sortResourceEntriesByTypeId(buildingContentEntries)),
    ...serializeEntries(sortResourceEntriesByTypeId(structureContentEntries)),
    ...serializeEntries(sortResourceEntriesByTypeId(projectileContentEntries)),
    ...serializeEntries(sortResourceEntriesByTypeId(pickupContentEntries)),
  ],
  effects: serializeEntries(getAllEffectContentEntries()),
});

export function getResourceDisplayLabel(typeId: string): string {
  if (isResourceId(typeId)) {
    const itemContent = getItemContent(typeId);
    if (itemContent) {
      return itemContent.label;
    }

    const entityContent = getEntityContent(typeId);
    if (entityContent) {
      return entityContent.label;
    }

    const effectContent = getEffectContent(typeId);
    if (effectContent) {
      return effectContent.label;
    }
  }

  const path = getResourcePath(typeId) || typeId;
  const baseLabel = path.split("/").pop() ?? path;
  return baseLabel
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

import { buildingContentEntries } from "@shared/content/building/index.ts";
import { enemyContentEntries } from "@shared/content/enemy/index.ts";
import { effectContentEntries } from "@shared/content/effect/index.ts";
import { itemContentEntries } from "@shared/content/item/index.ts";
import { pickupContentEntries } from "@shared/content/pickup/index.ts";
import { playerContentEntries } from "@shared/content/player/index.ts";
import { projectileContentEntries } from "@shared/content/projectile/index.ts";
import type {
  EffectContent,
  EntityContent,
  ItemContent,
  PlayerStarterLoadout,
  ProjectileContent,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const itemContents = new Map<ResourceId, ItemContent>(itemContentEntries);

const entityContents = new Map<ResourceId, EntityContent>([
  ...playerContentEntries,
  ...enemyContentEntries,
  ...buildingContentEntries,
  ...projectileContentEntries,
  ...pickupContentEntries,
]);

const effectContents = new Map<ResourceId, EffectContent>(effectContentEntries);

export const CRAFTABLE_ITEM_TYPE_IDS = Object.freeze(
  [...itemContents.entries()]
    .filter(([, itemContent]) => itemContent.recipe !== undefined)
    .map(([typeId]) => typeId),
);

export const BUILDABLE_ITEM_TYPE_IDS = Object.freeze(
  [...itemContents.entries()]
    .filter(([, itemContent]) => itemContent.buildsEntityTypeId !== undefined)
    .map(([typeId]) => typeId),
);

export function getItemContent(typeId: ResourceId): ItemContent | undefined {
  return itemContents.get(typeId);
}

export function requireItemContent(typeId: ResourceId): ItemContent {
  const itemContent = getItemContent(typeId);
  if (!itemContent) {
    throw new Error(`Unknown item content: ${typeId}`);
  }
  return itemContent;
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
  const entityContent = getEntityContent(typeId);
  if (!entityContent) {
    throw new Error(`Unknown entity content: ${typeId}`);
  }
  return entityContent;
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

export function getPlayerStarterLoadout(
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

export function getEffectContent(
  typeId: ResourceId,
): EffectContent | undefined {
  return effectContents.get(typeId);
}

export function requireEffectContent(typeId: ResourceId): EffectContent {
  const effectContent = getEffectContent(typeId);
  if (!effectContent) {
    throw new Error(`Unknown effect content: ${typeId}`);
  }
  return effectContent;
}

export function getCraftableItemTypeIds(): readonly ResourceId[] {
  return CRAFTABLE_ITEM_TYPE_IDS;
}

export function getBuildableItemTypeIds(): readonly ResourceId[] {
  return BUILDABLE_ITEM_TYPE_IDS;
}

export function getAllItemContentEntries(): Array<[ResourceId, ItemContent]> {
  return [...itemContents.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function getAllEntityContentEntries(): Array<
  [ResourceId, EntityContent]
> {
  return [...entityContents.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function getAllEffectContentEntries(): Array<
  [ResourceId, EffectContent]
> {
  return [...effectContents.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function getResourceDisplayLabel(typeId: string): string {
  const resourceId = typeId as ResourceId;
  const itemContent = getItemContent(resourceId);
  if (itemContent) {
    return itemContent.label;
  }

  const entityContent = getEntityContent(resourceId);
  if (entityContent) {
    return entityContent.label;
  }

  const effectContent = getEffectContent(resourceId);
  if (effectContent) {
    return effectContent.label;
  }

  const [, path = typeId] = typeId.split(":");
  const baseLabel = path.split("/").pop() ?? path;
  return baseLabel
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

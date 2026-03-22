import type {
  EntityContent,
  ItemContent,
} from "@shared/content/schema.ts";
import {
  EntityContentSchema,
  ItemContentSchema,
} from "@shared/content/schema.ts";
import {
  makeResourceId,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";
import basicGunItemJson from "@shared/content/item/basic_gun.json";
import basicSwordItemJson from "@shared/content/item/basic_sword.json";
import craftingStationItemJson from "@shared/content/item/crafting_station.json";
import foodItemJson from "@shared/content/item/food.json";
import stoneItemJson from "@shared/content/item/stone.json";
import towerItemJson from "@shared/content/item/tower.json";
import wallItemJson from "@shared/content/item/wall.json";
import windmillItemJson from "@shared/content/item/windmill.json";
import woodItemJson from "@shared/content/item/wood.json";
import zombieSwordItemJson from "@shared/content/item/zombie_sword.json";
import craftingStationEntityJson from "@shared/content/building/crafting_station.json";
import towerEntityJson from "@shared/content/building/tower.json";
import wallEntityJson from "@shared/content/building/wall.json";
import windmillEntityJson from "@shared/content/building/windmill.json";
import skeletonEntityJson from "@shared/content/enemy/skeleton.json";
import zombieEntityJson from "@shared/content/enemy/zombie.json";
import pickupEntityJson from "@shared/content/pickup/item_entity.json";
import playerEntityJson from "@shared/content/player/base.json";
import projectileEntityJson from "@shared/content/projectile/basic_bullet.json";

function parseItemContent(typeId: ResourceId, rawContent: unknown): ItemContent {
  const parsedContent = ItemContentSchema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid item content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return parsedContent.data;
}

function parseEntityContent(
  typeId: ResourceId,
  rawContent: unknown,
): EntityContent {
  const parsedContent = EntityContentSchema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid entity content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return parsedContent.data;
}

const itemContents = new Map<ResourceId, ItemContent>([
  [
    makeResourceId("item", "basic_gun"),
    parseItemContent(makeResourceId("item", "basic_gun"), basicGunItemJson),
  ],
  [
    makeResourceId("item", "basic_sword"),
    parseItemContent(makeResourceId("item", "basic_sword"), basicSwordItemJson),
  ],
  [
    makeResourceId("item", "zombie_sword"),
    parseItemContent(
      makeResourceId("item", "zombie_sword"),
      zombieSwordItemJson,
    ),
  ],
  [
    makeResourceId("item", "wood"),
    parseItemContent(makeResourceId("item", "wood"), woodItemJson),
  ],
  [
    makeResourceId("item", "stone"),
    parseItemContent(makeResourceId("item", "stone"), stoneItemJson),
  ],
  [
    makeResourceId("item", "food"),
    parseItemContent(makeResourceId("item", "food"), foodItemJson),
  ],
  [
    makeResourceId("item", "wall"),
    parseItemContent(makeResourceId("item", "wall"), wallItemJson),
  ],
  [
    makeResourceId("item", "tower"),
    parseItemContent(makeResourceId("item", "tower"), towerItemJson),
  ],
  [
    makeResourceId("item", "windmill"),
    parseItemContent(makeResourceId("item", "windmill"), windmillItemJson),
  ],
  [
    makeResourceId("item", "crafting_station"),
    parseItemContent(
      makeResourceId("item", "crafting_station"),
      craftingStationItemJson,
    ),
  ],
]);

const entityContents = new Map<ResourceId, EntityContent>([
  [
    makeResourceId("player", "base"),
    parseEntityContent(makeResourceId("player", "base"), playerEntityJson),
  ],
  [
    makeResourceId("enemy", "zombie"),
    parseEntityContent(makeResourceId("enemy", "zombie"), zombieEntityJson),
  ],
  [
    makeResourceId("enemy", "skeleton"),
    parseEntityContent(makeResourceId("enemy", "skeleton"), skeletonEntityJson),
  ],
  [
    makeResourceId("building", "wall"),
    parseEntityContent(makeResourceId("building", "wall"), wallEntityJson),
  ],
  [
    makeResourceId("building", "tower"),
    parseEntityContent(makeResourceId("building", "tower"), towerEntityJson),
  ],
  [
    makeResourceId("building", "windmill"),
    parseEntityContent(
      makeResourceId("building", "windmill"),
      windmillEntityJson,
    ),
  ],
  [
    makeResourceId("building", "crafting_station"),
    parseEntityContent(
      makeResourceId("building", "crafting_station"),
      craftingStationEntityJson,
    ),
  ],
  [
    makeResourceId("projectile", "basic_bullet"),
    parseEntityContent(
      makeResourceId("projectile", "basic_bullet"),
      projectileEntityJson,
    ),
  ],
  [
    makeResourceId("pickup", "item_entity"),
    parseEntityContent(makeResourceId("pickup", "item_entity"), pickupEntityJson),
  ],
]);

export const CRAFTABLE_ITEM_TYPE_IDS = Object.freeze(
  [...itemContents.entries()]
    .filter(([, itemContent]) => itemContent.recipe !== undefined)
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

export function getEntityContent(typeId: ResourceId): EntityContent | undefined {
  return entityContents.get(typeId);
}

export function requireEntityContent(typeId: ResourceId): EntityContent {
  const entityContent = getEntityContent(typeId);
  if (!entityContent) {
    throw new Error(`Unknown entity content: ${typeId}`);
  }
  return entityContent;
}

export function getCraftableItemTypeIds(): readonly ResourceId[] {
  return CRAFTABLE_ITEM_TYPE_IDS;
}

import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { EntityDefinition } from "@shared/content/types.ts";

const entityDefinitions = {
  "player:base": {
    typeId: "player:base",
    label: "Player",
    kind: "player",
  },
  "enemy:zombie": {
    typeId: "enemy:zombie",
    label: "Zombie",
    kind: "enemy",
  },
  "enemy:skeleton": {
    typeId: "enemy:skeleton",
    label: "Skeleton",
    kind: "enemy",
  },
  "building:wall": {
    typeId: "building:wall",
    label: "Wall",
    kind: "building",
  },
  "building:tower": {
    typeId: "building:tower",
    label: "Tower",
    kind: "building",
  },
  "building:windmill": {
    typeId: "building:windmill",
    label: "Windmill",
    kind: "building",
  },
  "building:crafting_station": {
    typeId: "building:crafting_station",
    label: "Crafting Station",
    kind: "building",
  },
  "projectile:basic_bullet": {
    typeId: "projectile:basic_bullet",
    label: "Bullet",
    kind: "projectile",
  },
  "pickup:item_entity": {
    typeId: "pickup:item_entity",
    label: "Pickup",
    kind: "pickup",
  },
} as const satisfies Record<string, EntityDefinition>;

export const ENTITY_DEFINITIONS = entityDefinitions;

export function getEntityDefinition(
  typeId: ResourceId,
): EntityDefinition | undefined {
  return ENTITY_DEFINITIONS[typeId as keyof typeof ENTITY_DEFINITIONS];
}

export function requireEntityDefinition(typeId: ResourceId): EntityDefinition {
  const definition = getEntityDefinition(typeId);
  if (!definition) {
    throw new Error(`Unknown entity definition: ${typeId}`);
  }
  return definition;
}

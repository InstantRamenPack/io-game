import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  ItemDefinition,
  StructureItemDefinition,
} from "@shared/content/types.ts";

const itemDefinitions = {
  "item:basic_gun": {
    typeId: "item:basic_gun",
    label: "Gun",
    stackMax: 1,
  },
  "item:basic_sword": {
    typeId: "item:basic_sword",
    label: "Sword",
    stackMax: 1,
  },
  "item:zombie_sword": {
    typeId: "item:zombie_sword",
    label: "Zombie Sword",
    stackMax: 1,
  },
  "item:wood": {
    typeId: "item:wood",
    label: "Wood",
    stackMax: 999,
  },
  "item:stone": {
    typeId: "item:stone",
    label: "Stone",
    stackMax: 999,
  },
  "item:food": {
    typeId: "item:food",
    label: "Food",
    stackMax: 99,
  },
  "item:wall": {
    typeId: "item:wall",
    label: "Wall Item",
    stackMax: 99,
    buildingTypeId: "building:wall",
  },
  "item:tower": {
    typeId: "item:tower",
    label: "Tower Item",
    stackMax: 99,
    buildingTypeId: "building:tower",
  },
  "item:windmill": {
    typeId: "item:windmill",
    label: "Windmill Item",
    stackMax: 99,
    buildingTypeId: "building:windmill",
  },
  "item:crafting_station": {
    typeId: "item:crafting_station",
    label: "Crafting Station Item",
    stackMax: 99,
    buildingTypeId: "building:crafting_station",
  },
} as const satisfies Record<string, ItemDefinition | StructureItemDefinition>;

export const ITEM_DEFINITIONS = itemDefinitions;

export function getItemDefinition(
  typeId: ResourceId,
): ItemDefinition | undefined {
  return ITEM_DEFINITIONS[typeId as keyof typeof ITEM_DEFINITIONS];
}

export function requireItemDefinition(typeId: ResourceId): ItemDefinition {
  const definition = getItemDefinition(typeId);
  if (!definition) {
    throw new Error(`Unknown item definition: ${typeId}`);
  }
  return definition;
}

export function isStructureItemDefinition(
  definition: ItemDefinition | undefined,
): definition is StructureItemDefinition {
  return Boolean(definition && "buildingTypeId" in definition);
}

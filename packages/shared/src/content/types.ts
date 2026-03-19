import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type EntityKind =
  | "player"
  | "enemy"
  | "building"
  | "projectile"
  | "pickup";

export type RecipeId =
  | "recipe:wall_item"
  | "recipe:tower_item"
  | "recipe:windmill_item"
  | "recipe:crafting_station_item";

export type ItemRequirement = {
  typeId: ResourceId;
  amount: number;
};

export type ItemDefinition = {
  typeId: ResourceId;
  label: string;
  stackMax: number;
};

export type StructureItemDefinition = ItemDefinition & {
  buildingTypeId: ResourceId;
};

export type EntityDefinition = {
  typeId: ResourceId;
  label: string;
  kind: EntityKind;
};

export type RecipeDefinition = {
  id: RecipeId;
  label: string;
  hint?: string;
  outputItemTypeId: ResourceId;
  outputAmount: number;
  costs: ItemRequirement[];
  requiredNearbyBuildingTypeId?: ResourceId;
};

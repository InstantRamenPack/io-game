import type { ItemRequirement } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ResourceAmountLike = {
  typeId: ResourceId;
  amount: number;
};

export type CraftingStationAccessInput = {
  nearCraftingStation: boolean;
};

export type CraftingStationAccessResult =
  | { ok: true }
  | { ok: false; reason: "not_near_station" };

export type CraftingInventoryRuleInput = {
  costs: readonly ItemRequirement[];
  availableResources: readonly ResourceAmountLike[];
};

export type CraftingInventoryRuleResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_resources";
      missing: ItemRequirement[];
    };

export type CraftingRuleInput = CraftingStationAccessInput &
  CraftingInventoryRuleInput;

export type CraftingRuleResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_near_station" | "missing_resources";
      missing?: ItemRequirement[];
    };

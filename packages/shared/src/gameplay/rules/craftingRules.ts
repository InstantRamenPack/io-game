import {
  CRAFTING_STATION_INTERACT_PADDING,
  CRAFTING_STATION_QUERY_RADIUS,
} from "@shared/gameplay/constants.ts";
import type {
  CraftingInventoryRuleInput,
  CraftingInventoryRuleResult,
  CraftingRuleInput,
  CraftingRuleResult,
  CraftingStationAccessInput,
  CraftingStationAccessResult,
  ResourceAmountLike,
} from "@shared/gameplay/rules/types.ts";

function getAvailableAmount(
  availableResources: readonly ResourceAmountLike[],
  typeId: ResourceAmountLike["typeId"],
): number {
  return (
    availableResources.find((resource) => resource.typeId === typeId)?.amount ??
    0
  );
}

export function evaluateCraftingStationAccess(
  input: CraftingStationAccessInput,
): CraftingStationAccessResult {
  return input.nearCraftingStation
    ? { ok: true }
    : { ok: false, reason: "not_near_station" };
}

export function evaluateCraftingInventory(
  input: CraftingInventoryRuleInput,
): CraftingInventoryRuleResult {
  const missing = input.costs.filter(
    (cost) =>
      getAvailableAmount(input.availableResources, cost.typeId) < cost.amount,
  );

  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_resources",
      missing: missing.map((cost) => ({ ...cost })),
    };
  }

  return { ok: true };
}

export function evaluateCraftingRequest(
  input: CraftingRuleInput,
): CraftingRuleResult {
  const stationAccess = evaluateCraftingStationAccess(input);
  if (!stationAccess.ok) {
    return stationAccess;
  }

  const inventory = evaluateCraftingInventory(input);
  if (!inventory.ok) {
    return inventory;
  }

  return { ok: true };
}

export { CRAFTING_STATION_INTERACT_PADDING, CRAFTING_STATION_QUERY_RADIUS };

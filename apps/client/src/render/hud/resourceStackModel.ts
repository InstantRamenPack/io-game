import type { ResourceStackEntry } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";

const HIDDEN_RESOURCE_TYPE_IDS = new Set<ResourceId>([
  "item:pistol_mag",
  "item:rifle_mag",
  "item:crossbow_mag",
  "item:drone_mag",
  "item:hunk",
]);

export function syncDiscoveredResources(options: {
  inventory: InventorySnapshot | undefined;
  discoveredResourceTypeIds: ResourceId[];
  resourceCounts: Map<ResourceId, number>;
}): void {
  const { inventory, discoveredResourceTypeIds, resourceCounts } = options;
  const presentResources = new Map<ResourceId, number>();
  for (const knownTypeId of discoveredResourceTypeIds) {
    presentResources.set(knownTypeId, 0);
  }

  for (const resource of inventory?.resources ?? []) {
    if (HIDDEN_RESOURCE_TYPE_IDS.has(resource.typeId)) {
      continue;
    }
    if (!discoveredResourceTypeIds.includes(resource.typeId)) {
      discoveredResourceTypeIds.unshift(resource.typeId);
    }
    presentResources.set(resource.typeId, resource.amount);
  }

  for (const typeId of discoveredResourceTypeIds) {
    resourceCounts.set(typeId, presentResources.get(typeId) ?? 0);
  }
}

export function buildResourceStackEntries(options: {
  discoveredResourceTypeIds: ResourceId[];
  resourceCounts: Map<ResourceId, number>;
}): ResourceStackEntry[] {
  const { discoveredResourceTypeIds, resourceCounts } = options;
  return discoveredResourceTypeIds
    .filter((typeId) => !HIDDEN_RESOURCE_TYPE_IDS.has(typeId))
    .map((typeId) => ({
      typeId,
      count: resourceCounts.get(typeId) ?? 0,
    }));
}

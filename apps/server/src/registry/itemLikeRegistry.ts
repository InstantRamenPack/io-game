import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  blueprintTypeRegistry,
  itemTypeRegistry,
  magTypeRegistry,
  type BlueprintTypeEntry,
  type ItemTypeEntry,
  type MagTypeEntry,
} from "@server/registry/registries.ts";

export type ItemLikeTypeEntry =
  | ItemTypeEntry
  | MagTypeEntry
  | BlueprintTypeEntry;

export function getItemLikeTypeEntry(
  typeId: ResourceId,
): ItemLikeTypeEntry | undefined {
  return (
    itemTypeRegistry.get(typeId) ??
    magTypeRegistry.get(typeId) ??
    blueprintTypeRegistry.get(typeId)
  );
}

export function requireItemLikeTypeEntry(
  typeId: ResourceId,
): ItemLikeTypeEntry {
  const entry = getItemLikeTypeEntry(typeId);
  if (!entry) {
    throw new Error(`Unknown item-like type id: ${typeId}`);
  }
  return entry;
}

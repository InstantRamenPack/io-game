import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  gameTypeRegistry,
  type BlueprintTypeEntry,
  type ItemTypeEntry,
  type MagTypeEntry,
} from "@server/registry/registries.ts";

export type ItemLikeTypeEntry =
  | ItemTypeEntry
  | MagTypeEntry
  | BlueprintTypeEntry;

const ITEM_LIKE_CATEGORIES = new Set(["item", "mag", "blueprint"]);

function isItemLikeCategory(
  category: string,
): category is "item" | "mag" | "blueprint" {
  return ITEM_LIKE_CATEGORIES.has(category);
}

export function getItemLikeTypeEntry(
  typeId: ResourceId,
): ItemLikeTypeEntry | undefined {
  const entry = gameTypeRegistry.get(typeId);
  if (!entry || !isItemLikeCategory(entry.category)) {
    return undefined;
  }
  const { category: _category, ...legacyEntry } = entry;
  return legacyEntry as ItemLikeTypeEntry;
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

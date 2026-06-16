import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  gameTypeRegistry,
  type GameTypeEntry,
} from "@server/registry/registries.ts";

export type ItemLikeTypeEntry =
  | Extract<GameTypeEntry, { readonly category: "item" }>
  | Extract<GameTypeEntry, { readonly category: "mag" }>
  | Extract<GameTypeEntry, { readonly category: "blueprint" }>;

function isItemLikeEntry(entry: GameTypeEntry): entry is ItemLikeTypeEntry {
  return (
    entry.category === "item" ||
    entry.category === "mag" ||
    entry.category === "blueprint"
  );
}

export function getItemLikeTypeEntry(
  typeId: ResourceId,
): ItemLikeTypeEntry | undefined {
  const entry = gameTypeRegistry.get(typeId);
  if (!entry || !isItemLikeEntry(entry)) {
    return undefined;
  }
  return entry;
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

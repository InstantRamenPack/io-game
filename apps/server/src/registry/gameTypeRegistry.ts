import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type {
  BlueprintTypeEntry,
  EffectTypeEntry,
  EntityTypeEntry,
  ItemTypeEntry,
  MagTypeEntry,
} from "@server/registry/registries.ts";

export type GameTypeCategory =
  | "entity"
  | "item"
  | "mag"
  | "blueprint"
  | "effect";

export type GameTypeEntry =
  | (EntityTypeEntry & { readonly category: "entity" })
  | (ItemTypeEntry & { readonly category: "item" })
  | (MagTypeEntry & { readonly category: "mag" })
  | (BlueprintTypeEntry & { readonly category: "blueprint" })
  | (EffectTypeEntry & { readonly category: "effect" });

export const gameTypeRegistry = new TypeRegistry<GameTypeEntry>();

type GameTypeEntryByCategory = {
  entity: Extract<GameTypeEntry, { readonly category: "entity" }>;
  item: Extract<GameTypeEntry, { readonly category: "item" }>;
  mag: Extract<GameTypeEntry, { readonly category: "mag" }>;
  blueprint: Extract<GameTypeEntry, { readonly category: "blueprint" }>;
  effect: Extract<GameTypeEntry, { readonly category: "effect" }>;
};

export function hasGameTypeEntry(
  typeId: ResourceId,
  category: GameTypeCategory,
): boolean {
  return gameTypeRegistry.get(typeId)?.category === category;
}

export function getGameTypeEntry<TCategory extends GameTypeCategory>(
  typeId: ResourceId,
  category: TCategory,
): GameTypeEntryByCategory[TCategory] | undefined {
  const entry = gameTypeRegistry.get(typeId);
  if (!entry || entry.category !== category) {
    return undefined;
  }
  return entry as GameTypeEntryByCategory[TCategory];
}

export function requireGameTypeEntry<TCategory extends GameTypeCategory>(
  typeId: ResourceId,
  category: TCategory,
): GameTypeEntryByCategory[TCategory] {
  const entry = getGameTypeEntry(typeId, category);
  if (entry === undefined) {
    throw new Error(`Unknown type id: ${typeId}`);
  }
  return entry;
}

export function* gameTypeEntries<TCategory extends GameTypeCategory>(
  category: TCategory,
): IterableIterator<[ResourceId, GameTypeEntryByCategory[TCategory]]> {
  for (const [typeId, entry] of gameTypeRegistry.entries()) {
    if (entry.category === category) {
      yield [typeId, entry as GameTypeEntryByCategory[TCategory]];
    }
  }
}

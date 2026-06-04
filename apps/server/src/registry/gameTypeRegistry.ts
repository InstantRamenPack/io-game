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

type LegacyTypeEntry =
  | EntityTypeEntry
  | ItemTypeEntry
  | MagTypeEntry
  | BlueprintTypeEntry
  | EffectTypeEntry;

class CategoryRegistryView<TEntry extends LegacyTypeEntry> {
  constructor(
    private readonly parent: TypeRegistry<GameTypeEntry>,
    private readonly category: GameTypeCategory,
  ) {}

  public register(_typeId: ResourceId, _value: TEntry): void {
    throw new Error(
      `Cannot register ${this.category} entries directly; use gameTypeRegistry during bootstrap.`,
    );
  }

  public registerAll(_entries: Iterable<TEntry>): void {
    throw new Error(
      `Cannot register ${this.category} entries directly; use gameTypeRegistry during bootstrap.`,
    );
  }

  public freeze(): void {
    // Views reflect the parent registry freeze state.
  }

  public has(typeId: ResourceId): boolean {
    const entry = this.parent.get(typeId);
    return entry?.category === this.category;
  }

  public get(typeId: ResourceId): TEntry | undefined {
    const entry = this.parent.get(typeId);
    if (!entry || entry.category !== this.category) {
      return undefined;
    }
    return this.toLegacyEntry(entry);
  }

  public require(typeId: ResourceId): TEntry {
    const entry = this.get(typeId);
    if (entry === undefined) {
      throw new Error(`Unknown type id: ${typeId}`);
    }
    return entry;
  }

  public entries(): IterableIterator<[ResourceId, TEntry]> {
    return this.iterEntries();
  }

  public ids(): IterableIterator<ResourceId> {
    return this.iterIds();
  }

  private *iterEntries(): IterableIterator<[ResourceId, TEntry]> {
    for (const [typeId, entry] of this.parent.entries()) {
      if (entry.category !== this.category) {
        continue;
      }
      yield [typeId, this.toLegacyEntry(entry)];
    }
  }

  private *iterIds(): IterableIterator<ResourceId> {
    for (const [typeId, entry] of this.parent.entries()) {
      if (entry.category === this.category) {
        yield typeId;
      }
    }
  }

  private toLegacyEntry(entry: GameTypeEntry): TEntry {
    const { category: _category, ...legacyEntry } = entry;
    return legacyEntry as TEntry;
  }
}

export const entityTypeRegistry = new CategoryRegistryView<EntityTypeEntry>(
  gameTypeRegistry,
  "entity",
);
export const itemTypeRegistry = new CategoryRegistryView<ItemTypeEntry>(
  gameTypeRegistry,
  "item",
);
export const magTypeRegistry = new CategoryRegistryView<MagTypeEntry>(
  gameTypeRegistry,
  "mag",
);
export const blueprintTypeRegistry =
  new CategoryRegistryView<BlueprintTypeEntry>(gameTypeRegistry, "blueprint");
export const effectTypeRegistry = new CategoryRegistryView<EffectTypeEntry>(
  gameTypeRegistry,
  "effect",
);

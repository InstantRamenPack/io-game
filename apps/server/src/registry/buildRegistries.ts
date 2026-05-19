import {
  getAllEffectContentEntries,
  getAllEntityContentEntries,
  getAllItemContentEntries,
  requireEffectContent,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  EffectTypeEntry,
  EntityTypeEntry,
  ItemTypeEntry,
  RegistrableEffectCtor,
  RegistrableEntityCtor,
  RegistrableItemCtor,
} from "@server/registry/registries.ts";
import {
  effectRuntimeCtors,
  entityRuntimeCtors,
  itemRuntimeCtors,
} from "@server/registry/runtimeRegistry.ts";

function assertUniqueRuntimeTypeIds(
  entries: Iterable<{ readonly typeId: ResourceId }>,
  registryName: string,
): void {
  const seenTypeIds = new Set<ResourceId>();
  for (const entry of entries) {
    if (seenTypeIds.has(entry.typeId)) {
      throw new Error(
        `Duplicate runtime ${registryName} registration for ${entry.typeId}.`,
      );
    }
    seenTypeIds.add(entry.typeId);
  }
}

function assertRuntimeCoverage(
  registryName: string,
  contentTypeIds: readonly ResourceId[],
  runtimeTypeIds: readonly ResourceId[],
): void {
  const runtimeSet = new Set(runtimeTypeIds);
  const contentSet = new Set(contentTypeIds);

  for (const typeId of contentTypeIds) {
    if (!runtimeSet.has(typeId)) {
      throw new Error(
        `Missing runtime ${registryName} constructor for shared content ${typeId}.`,
      );
    }
  }

  for (const typeId of runtimeTypeIds) {
    if (!contentSet.has(typeId)) {
      throw new Error(
        `Runtime ${registryName} constructor ${typeId} has no shared content entry.`,
      );
    }
  }
}

function buildEntityTypeEntry(ctor: RegistrableEntityCtor): EntityTypeEntry {
  return {
    typeId: ctor.typeId,
    kind: ctor.kind,
    content: requireEntityContent(ctor.typeId),
    ctor,
  };
}

function buildItemTypeEntry(ctor: RegistrableItemCtor): ItemTypeEntry {
  return {
    typeId: ctor.typeId,
    content: requireItemContent(ctor.typeId),
    ctor,
  };
}

function buildEffectTypeEntry(ctor: RegistrableEffectCtor): EffectTypeEntry {
  return {
    typeId: ctor.typeId,
    content: requireEffectContent(ctor.typeId),
    ctor,
  };
}

export function buildEntityTypeEntries(): readonly EntityTypeEntry[] {
  assertUniqueRuntimeTypeIds(entityRuntimeCtors, "entity");
  assertRuntimeCoverage(
    "entity",
    getAllEntityContentEntries().map(([typeId]) => typeId),
    entityRuntimeCtors.map((ctor) => ctor.typeId),
  );
  return entityRuntimeCtors.map(buildEntityTypeEntry);
}

export function buildItemTypeEntries(): readonly ItemTypeEntry[] {
  assertUniqueRuntimeTypeIds(itemRuntimeCtors, "item");
  assertRuntimeCoverage(
    "item",
    getAllItemContentEntries().map(([typeId]) => typeId),
    itemRuntimeCtors.map((ctor) => ctor.typeId),
  );
  return itemRuntimeCtors.map(buildItemTypeEntry);
}

export function buildEffectTypeEntries(): readonly EffectTypeEntry[] {
  assertUniqueRuntimeTypeIds(effectRuntimeCtors, "effect");
  assertRuntimeCoverage(
    "effect",
    getAllEffectContentEntries().map(([typeId]) => typeId),
    effectRuntimeCtors.map((ctor) => ctor.typeId),
  );
  return effectRuntimeCtors.map(buildEffectTypeEntry);
}

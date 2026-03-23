import {
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { coreEntityTypes } from "@server/entities/index.ts";
import { buildingEntityTypes } from "@server/entities/buildings/index.ts";
import { enemyEntityTypes } from "@server/entities/enemies/index.ts";
import { projectileEntityTypes } from "@server/entities/projectiles/index.ts";
import { materialItemTypes } from "@server/items/resources/Materials.ts";
import { structureItemTypes } from "@server/items/resources/StructureItems.ts";
import { weaponItemTypes } from "@server/items/weapons/index.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
  projectileTypeRegistry,
  type EntityTypeEntry,
  type ItemTypeEntry,
  type RegistrableEntityCtor,
  type RegistrableItemCtor,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";
import {
  requireEntityClassMetadata,
  requireItemClassMetadata,
} from "@server/registry/typeMetadata.ts";

let registriesBootstrapped = false;

/**
 * Registers all currently implemented concrete entity and item types.
 */
export function bootstrapTypeRegistries(): void {
  if (registriesBootstrapped) {
    return;
  }

  for (const ctor of [
    ...coreEntityTypes,
    ...enemyEntityTypes,
    ...buildingEntityTypes,
    ...projectileEntityTypes,
  ]) {
    registerEntityType(ctor);
  }

  for (const ctor of [
    ...weaponItemTypes,
    ...materialItemTypes,
    ...structureItemTypes,
  ]) {
    registerItemType(ctor);
  }

  for (const ctor of projectileEntityTypes) {
    registerProjectileType(ctor);
  }

  validateRegistryContent();

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  projectileTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function registerEntityType(ctor: RegistrableEntityCtor): void {
  const metadata = requireEntityClassMetadata(ctor);
  const content = requireEntityContent(ctor.typeId);
  const entry: EntityTypeEntry = {
    typeId: ctor.typeId,
    kind: metadata.kind,
    content,
    ctor,
  };
  entityTypeRegistry.register(entry.typeId, entry);
}

function registerItemType(ctor: RegistrableItemCtor): void {
  const metadata = requireItemClassMetadata(ctor);
  const content = requireItemContent(ctor.typeId);
  const entry: ItemTypeEntry = {
    typeId: ctor.typeId,
    stackMax: metadata.stackMax,
    buildingTypeId: metadata.buildingTypeId,
    content,
    ctor,
  };
  itemTypeRegistry.register(entry.typeId, entry);
}

function registerProjectileType(ctor: RegistrableProjectileCtor): void {
  projectileTypeRegistry.register(ctor.typeId, ctor);
}

function validateRegistryContent(): void {
  for (const [, itemEntry] of itemTypeRegistry.entries()) {
    if (
      itemEntry.buildingTypeId &&
      !entityTypeRegistry.has(itemEntry.buildingTypeId)
    ) {
      throw new Error(
        `Item ${itemEntry.typeId} references unknown building type ${itemEntry.buildingTypeId}.`,
      );
    }

    for (const cost of itemEntry.content.recipe?.costs ?? []) {
      if (!itemTypeRegistry.has(cost.typeId)) {
        throw new Error(
          `Item ${itemEntry.typeId} recipe references unknown item ${cost.typeId}.`,
        );
      }
    }
  }
}

import {
  effectTypeRegistry,
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import {
  effectTypeManifests,
  entityTypeManifests,
  itemTypeManifests,
} from "@server/registry/manifests.ts";

let registriesBootstrapped = false;

/**
 * Registers all currently implemented concrete entity and item types.
 */
export function bootstrapTypeRegistries(): void {
  if (registriesBootstrapped) {
    return;
  }

  for (const entry of entityTypeManifests) {
    entityTypeRegistry.register(entry.typeId, entry);
  }

  for (const entry of itemTypeManifests) {
    itemTypeRegistry.register(entry.typeId, entry);
  }

  for (const entry of effectTypeManifests) {
    effectTypeRegistry.register(entry.typeId, entry);
  }

  validateRegistryContent();

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  effectTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function validateRegistryContent(): void {
  for (const [, itemEntry] of itemTypeRegistry.entries()) {
    if (
      itemEntry.content.buildsEntityTypeId &&
      !entityTypeRegistry.has(itemEntry.content.buildsEntityTypeId)
    ) {
      throw new Error(
        `Item ${itemEntry.typeId} references unknown building type ${itemEntry.content.buildsEntityTypeId}.`,
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

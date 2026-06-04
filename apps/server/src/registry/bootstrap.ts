import { buildGameTypeEntries } from "@server/registry/buildRegistries.ts";
import {
  entityTypeRegistry,
  gameTypeRegistry,
} from "@server/registry/registries.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";

let registriesBootstrapped = false;

/**
 * Registers all currently implemented concrete entity and item types.
 */
export function bootstrapTypeRegistries(): void {
  if (registriesBootstrapped) {
    return;
  }

  gameTypeRegistry.registerAll(buildGameTypeEntries());

  validateRegistryContent();

  gameTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function validateRegistryContent(): void {
  for (const [, entry] of gameTypeRegistry.entries()) {
    if (
      entry.category !== "item" &&
      entry.category !== "mag" &&
      entry.category !== "blueprint"
    ) {
      continue;
    }

    if (
      entry.content.buildsEntityTypeId &&
      !entityTypeRegistry.has(entry.content.buildsEntityTypeId)
    ) {
      throw new Error(
        `Item ${entry.typeId} references unknown building type ${entry.content.buildsEntityTypeId}.`,
      );
    }

    for (const cost of entry.content.recipe?.costs ?? []) {
      if (!getItemLikeTypeEntry(cost.typeId)) {
        throw new Error(
          `Item ${entry.typeId} recipe references unknown item ${cost.typeId}.`,
        );
      }
    }
  }
}

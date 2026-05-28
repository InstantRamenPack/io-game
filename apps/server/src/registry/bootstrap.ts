import {
  buildBlueprintTypeEntries,
  buildEffectTypeEntries,
  buildEntityTypeEntries,
  buildItemTypeEntries,
  buildMagTypeEntries,
} from "@server/registry/buildRegistries.ts";
import {
  blueprintTypeRegistry,
  effectTypeRegistry,
  entityTypeRegistry,
  itemTypeRegistry,
  magTypeRegistry,
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

  entityTypeRegistry.registerAll(buildEntityTypeEntries());
  itemTypeRegistry.registerAll(buildItemTypeEntries());
  magTypeRegistry.registerAll(buildMagTypeEntries());
  blueprintTypeRegistry.registerAll(buildBlueprintTypeEntries());
  effectTypeRegistry.registerAll(buildEffectTypeEntries());

  validateRegistryContent();

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  magTypeRegistry.freeze();
  blueprintTypeRegistry.freeze();
  effectTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function validateRegistryContent(): void {
  for (const [, itemEntry] of [
    ...itemTypeRegistry.entries(),
    ...magTypeRegistry.entries(),
    ...blueprintTypeRegistry.entries(),
  ]) {
    if (
      itemEntry.content.buildsEntityTypeId &&
      !entityTypeRegistry.has(itemEntry.content.buildsEntityTypeId)
    ) {
      throw new Error(
        `Item ${itemEntry.typeId} references unknown building type ${itemEntry.content.buildsEntityTypeId}.`,
      );
    }

    for (const cost of itemEntry.content.recipe?.costs ?? []) {
      if (!getItemLikeTypeEntry(cost.typeId)) {
        throw new Error(
          `Item ${itemEntry.typeId} recipe references unknown item ${cost.typeId}.`,
        );
      }
    }
  }
}

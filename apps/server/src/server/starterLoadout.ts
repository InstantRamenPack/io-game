import { requirePlayerStarterLoadout } from "@shared/content/catalog.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import type { Player } from "@server/entities/Player.ts";
import { isWeaponCtor } from "@server/runtime/ctorGuards.ts";
import { grantItemEntryByAcquisitionRules } from "@server/items/acquisition/granting.ts";

const PLAYER_BASE_TYPE_ID = makeResourceId("player", "base");

export function applyPlayerStarterLoadout(player: Player): void {
  const starterLoadout = requirePlayerStarterLoadout(PLAYER_BASE_TYPE_ID);

  for (const weaponTypeId of starterLoadout.weapons) {
    const weaponEntry = itemTypeRegistry.require(weaponTypeId);
    if (!isWeaponCtor(weaponEntry.ctor)) {
      throw new Error(
        `Starter loadout weapon ${weaponTypeId} is not a weapon item type.`,
      );
    }
    if (!grantItemEntryByAcquisitionRules(player.inventory, weaponEntry, 1)) {
      throw new Error(
        `Starter loadout weapon ${weaponTypeId} could not be granted to inventory.`,
      );
    }
  }

  for (const stackable of starterLoadout.stackables) {
    const itemEntry = itemTypeRegistry.require(stackable.typeId);
    if (isWeaponCtor(itemEntry.ctor)) {
      throw new Error(
        `Starter loadout stackable ${stackable.typeId} cannot be a weapon item type.`,
      );
    }
    if (
      !grantItemEntryByAcquisitionRules(
        player.inventory,
        itemEntry,
        stackable.amount,
      )
    ) {
      throw new Error(
        `Starter loadout stackable ${stackable.typeId} could not be granted to inventory.`,
      );
    }
  }

  player.inventory.setSelectedHotbarIndex(starterLoadout.selectedHotbarIndex);
}

export function validatePlayerStarterLoadout(): void {
  const starterLoadout = requirePlayerStarterLoadout(PLAYER_BASE_TYPE_ID);

  for (const weaponTypeId of starterLoadout.weapons) {
    const entry = itemTypeRegistry.get(weaponTypeId);
    if (!entry) {
      throw new Error(
        `Starter loadout references unknown weapon item ${weaponTypeId}.`,
      );
    }
    if (!isWeaponCtor(entry.ctor)) {
      throw new Error(
        `Starter loadout weapon ${weaponTypeId} is not registered as a weapon class.`,
      );
    }
  }

  for (const stackable of starterLoadout.stackables) {
    const entry = itemTypeRegistry.get(stackable.typeId);
    if (!entry) {
      throw new Error(
        `Starter loadout references unknown stackable item ${stackable.typeId}.`,
      );
    }
    if (isWeaponCtor(entry.ctor)) {
      throw new Error(
        `Starter loadout stackable ${stackable.typeId} is registered as a weapon.`,
      );
    }
  }
}

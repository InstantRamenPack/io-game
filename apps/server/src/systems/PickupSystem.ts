import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { requiresManualPickup } from "@server/content/serverContentCapabilities.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

/**
 * Merges stackable pickups and auto-collects stackables that do not require
 * manual pickup on player overlap. Blueprints, weapons, buildings, and medical
 * items stay manual via pickup action. World item creation is owned by
 * generation-time crates and enemy death drops.
 */
export class PickupSystem implements System {
  private readonly queryBuffer: Entity[] = [];
  private readonly removedPickupIds = new Set<number>();

  public update(world: World, deltaMs: number): void {
    void deltaMs;
    this.mergeOverlappingStackablePickups(
      world,
      world.entities.queryInstances(ItemEntity),
    );

    this.collectAutoPickups(world, world.entities.queryInstances(Player));
  }

  private collectAutoPickups(world: World, players: readonly Player[]): void {
    for (const player of players) {
      if (!player.alive) {
        continue;
      }
      const bounds = player.getWorldBounds();
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );
      const playerHitboxes = player.getWorldHitboxes();

      for (const candidate of candidates) {
        if (!(candidate instanceof ItemEntity)) {
          continue;
        }
        if (!world.entities.has(candidate.id)) {
          continue;
        }
        if (!this.shouldAutoPickup(candidate)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(
            playerHitboxes,
            candidate.getWorldHitboxes(),
          )
        ) {
          continue;
        }

        const transferable = this.buildAutoPickupInventory(candidate);
        if (!player.inventory.absorbInventoryByAcquisitionRules(transferable)) {
          continue;
        }
        world.despawn(candidate.id);
      }
    }
  }

  private mergeOverlappingStackablePickups(
    world: World,
    pickups: readonly ItemEntity[],
  ): void {
    this.removedPickupIds.clear();

    for (const pickup of pickups) {
      if (
        this.removedPickupIds.has(pickup.id) ||
        !world.entities.has(pickup.id)
      ) {
        continue;
      }
      if (!pickup.getSingleStackable()) {
        continue;
      }

      const bounds = pickup.getWorldBounds();
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );

      for (const candidate of candidates) {
        if (
          !(candidate instanceof ItemEntity) ||
          candidate.id === pickup.id ||
          this.removedPickupIds.has(candidate.id) ||
          !world.entities.has(candidate.id)
        ) {
          continue;
        }
        if (!pickup.canMergeStackableWith(candidate)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(
            pickup.getWorldHitboxes(),
            candidate.getWorldHitboxes(),
          )
        ) {
          continue;
        }
        if (!pickup.mergeStackableFrom(candidate)) {
          continue;
        }

        world.despawn(candidate.id);
        this.removedPickupIds.add(candidate.id);
      }
    }
  }

  private shouldAutoPickup(pickup: ItemEntity): boolean {
    for (const [typeId, amount] of pickup.contents.resources.entries()) {
      if (amount > 0 && requiresManualPickup(typeId)) {
        return false;
      }
    }

    for (const slot of pickup.contents.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        return false;
      }
      if (slot.count > 0 && requiresManualPickup(slot.typeId)) {
        return false;
      }
    }

    return true;
  }

  private buildAutoPickupInventory(pickup: ItemEntity): Inventory {
    const transferable = new Inventory();

    for (const [typeId, amount] of pickup.contents.resources.entries()) {
      if (amount <= 0) {
        continue;
      }
      transferable.addStackable(typeId, amount);
    }

    for (const slot of pickup.contents.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        transferable.addWeapon(slot.weapon);
        continue;
      }
      if (slot.count <= 0) {
        continue;
      }
      transferable.addStackable(slot.typeId, slot.count);
    }

    for (const unlockedRecipeTypeId of pickup.contents.getUnlockedRecipeTypeIds()) {
      transferable.unlockRecipe(unlockedRecipeTypeId);
    }

    return transferable;
  }
}

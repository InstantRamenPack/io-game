import type {
  ActionMessage,
  InputIntentMessage,
} from "@shared/net/protocol.ts";
import type { Chest } from "@server/entities/buildings/Chest.ts";
import { isContainerEntity } from "@server/content/serverContentCapabilities.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Server-side normalization and sanity checks for input messages.
 * The server stays authoritative even when validation remains lightweight.
 */
export class AntiCheatValidator {
  public validateInputIntent(
    _inputMessage: InputIntentMessage,
    playerEntity: Player,
  ): boolean {
    return playerEntity.alive;
  }

  public validateAction(
    actionMessage: ActionMessage,
    playerEntity: Player,
    world: World,
  ): boolean {
    if (!playerEntity.alive) {
      return false;
    }

    switch (actionMessage.action) {
      case "attack":
        return (
          playerEntity.getActiveWeapon() !== undefined ||
          playerEntity.canEquipSelectedArmorFromAttack()
        );
      case "build":
        return (
          actionMessage.build.x >= 0 &&
          actionMessage.build.x <= world.gameConfig.worldSize.w &&
          actionMessage.build.y >= 0 &&
          actionMessage.build.y <= world.gameConfig.worldSize.h
        );
      case "selectHotbar":
        return (
          actionMessage.index >= 0 &&
          actionMessage.index < playerEntity.inventory.hotbarSlots.length
        );
      case "inventoryMove":
        return this.isValidInventoryMove(actionMessage, playerEntity);
      case "armorMove":
        return this.isValidArmorMove(actionMessage, playerEntity);
      case "chestMove":
        return this.isValidChestMove(actionMessage, playerEntity, world);
      case "craft":
      case "drop":
      case "pickup":
      case "recycle":
      case "repair_tower":
      case "useConsumable":
        return true;
    }

    return false;
  }

  private isValidInventoryMove(
    actionMessage: ActionMessage,
    playerEntity: Player,
  ): boolean {
    if (actionMessage.action !== "inventoryMove") {
      return false;
    }

    const { fromSlotIndex, toSlotIndex } = actionMessage.inventoryMove;
    return !(
      fromSlotIndex < 0 ||
      fromSlotIndex >= playerEntity.inventory.hotbarSlots.length ||
      toSlotIndex < 0 ||
      toSlotIndex >= playerEntity.inventory.hotbarSlots.length ||
      playerEntity.inventory.hotbarSlots[fromSlotIndex] === undefined
    );
  }

  private isValidChestMove(
    actionMessage: ActionMessage,
    playerEntity: Player,
    world: World,
  ): boolean {
    if (actionMessage.action !== "chestMove") {
      return false;
    }

    const { chestEntityId, fromSource, fromIndex, toSource, toIndex } =
      actionMessage.chestMove;
    const hotbarSlotCount = playerEntity.inventory.hotbarSlots.length;
    const chestEntity = world.entities.get(chestEntityId);
    const chestSlotCount =
      chestEntity && isContainerEntity(chestEntity)
        ? chestEntity.chestSlots.length
        : 0;

    const isValidFrom =
      fromSource === "hotbar"
        ? fromIndex >= 0 && fromIndex < hotbarSlotCount
        : fromIndex >= 0 && fromIndex < chestSlotCount;
    const isValidTo =
      toSource === "hotbar"
        ? toIndex >= 0 && toIndex < hotbarSlotCount
        : toIndex >= 0 && toIndex < chestSlotCount;

    return isValidFrom && isValidTo;
  }

  private isValidArmorMove(
    actionMessage: ActionMessage,
    playerEntity: Player,
  ): boolean {
    if (actionMessage.action !== "armorMove") {
      return false;
    }
    const { fromSource, fromIndex, toSource, toIndex } =
      actionMessage.armorMove;
    const hotbarSlotCount = playerEntity.inventory.hotbarSlots.length;
    const isValidFrom =
      fromSource === "hotbar"
        ? fromIndex >= 0 && fromIndex < hotbarSlotCount
        : fromIndex === 0;
    const isValidTo =
      toSource === "hotbar"
        ? toIndex >= 0 && toIndex < hotbarSlotCount
        : toIndex === 0;
    return isValidFrom && isValidTo && fromSource !== toSource;
  }
}

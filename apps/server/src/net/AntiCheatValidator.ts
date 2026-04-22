import type {
  ActionMessage,
  AimMessage,
  MoveIntentMessage,
} from "@shared/net/protocol.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Server-side normalization and sanity checks for input messages.
 * The server stays authoritative even when validation remains lightweight.
 */
export class AntiCheatValidator {
  public validateMoveIntent(
    _moveIntent: MoveIntentMessage,
    playerEntity: Player,
  ): boolean {
    return playerEntity.alive;
  }

  public validateAim(_aimMessage: AimMessage, playerEntity: Player): boolean {
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
        return playerEntity.getActiveWeapon() !== undefined;
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
      case "craft":
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
    return (
      (fromSlotIndex < 0 ||
        fromSlotIndex >= playerEntity.inventory.hotbarSlots.length ||
        toSlotIndex < 0 ||
        toSlotIndex >= playerEntity.inventory.hotbarSlots.length ||
        playerEntity.inventory.hotbarSlots[fromSlotIndex] === undefined) ===
      false
    );
  }
}

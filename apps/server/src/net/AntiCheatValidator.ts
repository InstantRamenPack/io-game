import type { ActionMessage, MoveIntentMessage } from "@shared/net/protocol.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Server-side normalization and sanity checks for input messages.
 * The server stays authoritative even when validation remains lightweight.
 */
export class AntiCheatValidator {
  public validateMoveIntent(moveIntent: MoveIntentMessage): boolean {
    return Number.isFinite(moveIntent.seq);
  }

  public validateAction(
    actionMessage: ActionMessage,
    playerEntity: Player,
    world: World,
  ): boolean {
    if (!Number.isFinite(actionMessage.seq)) {
      return false;
    }

    switch (actionMessage.action) {
      case "attack":
        this.clampAttack(actionMessage, world);
        return true;
      case "build":
        this.clampBuild(actionMessage, world);
        return true;
      case "selectHotbar":
        this.clampSelectHotbar(actionMessage);
        return true;
      case "inventoryMove":
        this.clampInventoryMove(actionMessage, playerEntity);
        return true;
      case "craft":
        return true;
    }

    return false;
  }

  private clampAttack(actionMessage: ActionMessage, world: World): void {
    if (actionMessage.action !== "attack") {
      return;
    }

    const { x, y } = actionMessage.aim;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      actionMessage.aim = {
        x: world.gameConfig.worldSize.w / 2,
        y: world.gameConfig.worldSize.h / 2,
      };
      return;
    }

    actionMessage.aim = {
      x: Math.min(world.gameConfig.worldSize.w, Math.max(0, x)),
      y: Math.min(world.gameConfig.worldSize.h, Math.max(0, y)),
    };
  }

  private clampBuild(actionMessage: ActionMessage, world: World): void {
    if (actionMessage.action !== "build") {
      return;
    }

    const { x, y } = actionMessage.build;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      actionMessage.build = {
        x: world.gameConfig.worldSize.w / 2,
        y: world.gameConfig.worldSize.h / 2,
      };
      return;
    }

    actionMessage.build = {
      x: Math.min(world.gameConfig.worldSize.w, Math.max(0, x)),
      y: Math.min(world.gameConfig.worldSize.h, Math.max(0, y)),
    };
  }

  private clampSelectHotbar(actionMessage: ActionMessage): void {
    if (actionMessage.action !== "selectHotbar") {
      return;
    }

    if (
      !Number.isFinite(actionMessage.index) ||
      !Number.isInteger(actionMessage.index) ||
      actionMessage.index < 0 ||
      actionMessage.index >= 10
    ) {
      actionMessage.index = 0;
    }
  }

  private clampInventoryMove(
    actionMessage: ActionMessage,
    playerEntity: Player,
  ): void {
    if (actionMessage.action !== "inventoryMove") {
      return;
    }

    const { fromSlotIndex, toSlotIndex } = actionMessage.inventoryMove;
    if (
      !Number.isFinite(fromSlotIndex) ||
      !Number.isInteger(fromSlotIndex) ||
      !Number.isFinite(toSlotIndex) ||
      !Number.isInteger(toSlotIndex) ||
      fromSlotIndex < 0 ||
      fromSlotIndex >= 10 ||
      toSlotIndex < 0 ||
      toSlotIndex >= 10 ||
      !playerEntity.inventory.hotbarSlots[fromSlotIndex]
    ) {
      actionMessage.inventoryMove = {
        fromSlotIndex: 0,
        toSlotIndex: 0,
      };
    }
  }
}

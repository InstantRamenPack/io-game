import type { InputCommand } from "@shared/net/protocol.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Server-side normalization and sanity checks for input commands.
 * The server stays authoritative even when validation remains lightweight.
 */
export class AntiCheatValidator {
  /**
   * Validates and normalizes one input command payload.
   * @param inputCommand Input payload received from the client.
   * @param playerEntity Player entity associated with the payload.
   * @param world
   * @returns True when the command is acceptable.
   */
  public validate(
    inputCommand: InputCommand,
    playerEntity: Player,
    world: World,
  ): boolean {
    this.clampMove(inputCommand);
    this.clampAttack(inputCommand, world);
    this.clampBuild(inputCommand, world);
    this.clampSelectHotbarIndex(inputCommand);
    this.clampInventoryMove(inputCommand, playerEntity);

    return !(
      !Number.isFinite(inputCommand.seq) || !Number.isFinite(inputCommand.tick)
    );
  }

  /**
   * Clamps movement input to a unit-length vector and removes invalid numbers.
   * @param inputCommand Input payload being normalized.
   */
  public clampMove(inputCommand: InputCommand): void {
    if (!Number.isFinite(inputCommand.moveX)) inputCommand.moveX = 0;
    if (!Number.isFinite(inputCommand.moveY)) inputCommand.moveY = 0;

    const vectorLength = Math.hypot(inputCommand.moveX, inputCommand.moveY);
    if (vectorLength > 1) {
      inputCommand.moveX /= vectorLength;
      inputCommand.moveY /= vectorLength;
    }
  }

  /**
   * Normalizes one-shot attack world coordinates.
   * @param inputCommand Input payload being normalized.
   * @param world World bounds used to clamp the attack point.
   */
  private clampAttack(inputCommand: InputCommand, world: World): void {
    if (!inputCommand.attack) {
      return;
    }

    const { x, y } = inputCommand.attack;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      inputCommand.attack = undefined;
      return;
    }

    inputCommand.attack = {
      x: Math.min(world.gameConfig.worldSize.w, Math.max(0, x)),
      y: Math.min(world.gameConfig.worldSize.h, Math.max(0, y)),
    };
  }

  private clampSelectHotbarIndex(inputCommand: InputCommand): void {
    if (inputCommand.selectHotbarIndex === undefined) {
      return;
    }

    const { selectHotbarIndex } = inputCommand;
    if (
      !Number.isFinite(selectHotbarIndex) ||
      !Number.isInteger(selectHotbarIndex) ||
      selectHotbarIndex < 0 ||
      selectHotbarIndex >= 10
    ) {
      inputCommand.selectHotbarIndex = undefined;
      return;
    }
  }

  private clampBuild(inputCommand: InputCommand, world: World): void {
    if (!inputCommand.build) {
      return;
    }

    const { x, y } = inputCommand.build;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      inputCommand.build = undefined;
      return;
    }

    inputCommand.build = {
      ...inputCommand.build,
      x: Math.min(world.gameConfig.worldSize.w, Math.max(0, x)),
      y: Math.min(world.gameConfig.worldSize.h, Math.max(0, y)),
    };
  }

  private clampInventoryMove(
    inputCommand: InputCommand,
    playerEntity: Player,
  ): void {
    const inventoryMove = inputCommand.inventoryMove;
    if (!inventoryMove) {
      return;
    }

    const { fromSlotIndex, toSlotIndex } = inventoryMove;
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
      inputCommand.inventoryMove = undefined;
    }
  }
}

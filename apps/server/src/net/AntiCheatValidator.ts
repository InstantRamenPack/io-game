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
   * @param _playerEntity Player entity associated with the payload.
   * @param world
   * @returns True when the command is acceptable.
   */
  validate(
    inputCommand: InputCommand,
    playerEntity: Player,
    world: World,
  ): boolean {
    this.clampMove(inputCommand);
    this.clampAttack(inputCommand, world);
    this.clampSelectSlot(inputCommand, playerEntity);

    return !(
      !Number.isFinite(inputCommand.seq) || !Number.isFinite(inputCommand.tick)
    );
  }

  /**
   * Clamps movement input to a unit-length vector and removes invalid numbers.
   * @param inputCommand Input payload being normalized.
   */
  clampMove(inputCommand: InputCommand): void {
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

  private clampSelectSlot(
    inputCommand: InputCommand,
    playerEntity: Player,
  ): void {
    if (inputCommand.selectSlot === undefined) {
      return;
    }

    const { selectSlot } = inputCommand;
    if (
      !Number.isFinite(selectSlot) ||
      !Number.isInteger(selectSlot) ||
      !playerEntity.inventory ||
      selectSlot < 0 ||
      selectSlot >= playerEntity.inventory.slots.length
    ) {
      inputCommand.selectSlot = undefined;
      return;
    }
  }
}

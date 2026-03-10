import type { InputCommand } from "@shared/net/protocol.ts";
import type { Player } from "@server/entities/Player.ts";

/**
 * Server-side normalization and sanity checks for input commands.
 * The server stays authoritative even when validation remains lightweight.
 */
export class AntiCheatValidator {
  /**
   * Validates and normalizes one input command payload.
   * @param inputCommand Input payload received from the client.
   * @param _playerEntity Player entity associated with the payload.
   * @returns True when the command is acceptable.
   */
  validate(inputCommand: InputCommand, _playerEntity: Player): boolean {
    this.clampMove(inputCommand);

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
}

import { describe, expect, test } from "bun:test";
import { AntiCheatValidator } from "@server/net/AntiCheatValidator.ts";
import { Player } from "@server/entities/Player.ts";

describe("AntiCheatValidator", () => {
  test("clamps movement to a unit vector", () => {
    const antiCheatValidator = new AntiCheatValidator();
    const player = new Player(1);

    const inputCommand = {
      seq: 1,
      tick: 1,
      moveX: 10,
      moveY: 0,
    };

    const isValid = antiCheatValidator.validate(inputCommand, player);

    expect(isValid).toBe(true);
    expect(
      Math.hypot(inputCommand.moveX, inputCommand.moveY),
    ).toBeLessThanOrEqual(1);
  });
});

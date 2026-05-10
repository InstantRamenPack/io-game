import { describe, expect, test } from "bun:test";
import { normalizePlayerName } from "@shared/playerName.ts";

describe("player name normalization", () => {
  test("removes controls, trims, and caps length", () => {
    expect(
      normalizePlayerName(
        " \x00RaymondZhuIsLongerThanTwentyChars ",
        "fallback",
      ),
    ).toBe("RaymondZhuIsLongerTh");
  });

  test("uses fallback when requested name sanitizes empty", () => {
    expect(normalizePlayerName("\x00 \x7f", "player-12")).toBe("player-12");
  });
});

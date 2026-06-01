import { describe, expect, test } from "bun:test";
import { requireEffectContent } from "@shared/content/catalog.ts";

describe("effect content", () => {
  test("status effect defaults are authored in effect JSON for balance editing", () => {
    expect(requireEffectContent("effect:bleeding")).toMatchObject({
      durationTicks: 40,
      pulseIntervalTicks: 4,
      pulseDamage: 5,
    });
    expect(requireEffectContent("effect:confusion")).toMatchObject({
      durationTicks: 120,
      speedMultiplier: 0.4,
    });
    expect(requireEffectContent("effect:fractured")).toMatchObject({
      durationTicks: 180,
      speedMultiplier: 0.5,
    });
    expect(requireEffectContent("effect:knockback")).toMatchObject({
      impulseStrength: 15,
    });
    expect(requireEffectContent("effect:stunned")).toMatchObject({
      durationTicks: 10,
    });
  });
});

import { describe, expect, test } from "bun:test";
import { computeClientNightBlend } from "@shared/gameplay/dayNightBlend.ts";
import type { DayNightSnapshot } from "@shared/net/snapshots.ts";

function makeNightSnapshot(
  overrides: Partial<DayNightSnapshot> = {},
): DayNightSnapshot {
  return {
    dayCount: 0,
    phase: "night",
    phaseElapsedTicks: 1_180,
    dayDurationTicks: 6_000,
    nightDurationTicks: 1_200,
    waveEnemiesRemaining: 0,
    waveSpawnsPending: 0,
    waveThreatTotal: 10,
    ...overrides,
  };
}

describe("computeClientNightBlend", () => {
  test("stays fully night when wave threat remains after timer elapses", () => {
    const blend = computeClientNightBlend(
      makeNightSnapshot({
        phaseElapsedTicks: 1_199,
        waveEnemiesRemaining: 3,
      }),
    );
    expect(blend).toBe(1);
  });

  test("allows dawn transition once wave threat is cleared", () => {
    const blend = computeClientNightBlend(
      makeNightSnapshot({
        phaseElapsedTicks: 1_199,
        waveEnemiesRemaining: 0,
        waveSpawnsPending: 0,
      }),
    );
    expect(blend).toBeLessThan(1);
    expect(blend).toBeGreaterThan(0);
  });
});

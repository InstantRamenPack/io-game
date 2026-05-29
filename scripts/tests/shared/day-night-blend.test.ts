import { describe, expect, test } from "bun:test";
import { computeClientNightBlend } from "@shared/gameplay/dayNightBlend.ts";
import type { DayNightSnapshot } from "@shared/net/snapshots.ts";

function makeNightSnapshot(
  overrides: Partial<DayNightSnapshot> = {},
): DayNightSnapshot {
  return {
    dayCount: 0,
    phase: "night",
    phaseElapsedMs: 59_000,
    dayDurationMs: 300_000,
    nightDurationMs: 60_000,
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
        phaseElapsedMs: 59_999,
        waveEnemiesRemaining: 3,
      }),
    );
    expect(blend).toBe(1);
  });

  test("allows dawn transition once wave threat is cleared", () => {
    const blend = computeClientNightBlend(
      makeNightSnapshot({
        phaseElapsedMs: 59_999,
        waveEnemiesRemaining: 0,
        waveSpawnsPending: 0,
      }),
    );
    expect(blend).toBeLessThan(1);
    expect(blend).toBeGreaterThan(0);
  });
});

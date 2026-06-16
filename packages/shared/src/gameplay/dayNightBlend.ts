import type { DayNightSnapshot } from "@shared/net/snapshots.ts";

export function getDayNightWaveThreat(dayNight: DayNightSnapshot): number {
  return dayNight.waveEnemiesRemaining + dayNight.waveSpawnsPending;
}

/**
 * Client-side night blend for HUD and world lighting.
 * Night stays fully dark until wave enemies are cleared, matching server phase gating.
 */
export function computeClientNightBlend(
  dayNight: DayNightSnapshot,
  driftTicks = 0,
): number {
  if (dayNight.phase === "night" && getDayNightWaveThreat(dayNight) > 0) {
    return 1;
  }

  const phaseDuration =
    dayNight.phase === "night"
      ? dayNight.nightDurationTicks
      : dayNight.dayDurationTicks;
  if (phaseDuration <= 0) {
    return dayNight.phase === "night" ? 1 : 0;
  }

  const elapsed = Math.max(
    0,
    Math.min(dayNight.phaseElapsedTicks + driftTicks, phaseDuration),
  );
  const transitionTicks = Math.max(
    20,
    Math.min(300, Math.floor(phaseDuration * 0.2)),
  );

  if (elapsed >= phaseDuration - transitionTicks) {
    const t = (elapsed - (phaseDuration - transitionTicks)) / transitionTicks;
    return dayNight.phase === "night" ? 1 - t : t;
  }

  return dayNight.phase === "night" ? 1 : 0;
}

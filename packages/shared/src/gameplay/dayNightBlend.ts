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
  driftMs = 0,
): number {
  if (dayNight.phase === "night" && getDayNightWaveThreat(dayNight) > 0) {
    return 1;
  }

  const phaseDuration =
    dayNight.phase === "night"
      ? dayNight.nightDurationMs
      : dayNight.dayDurationMs;
  if (phaseDuration <= 0) {
    return dayNight.phase === "night" ? 1 : 0;
  }

  const elapsed = Math.max(
    0,
    Math.min(dayNight.phaseElapsedMs + driftMs, phaseDuration),
  );
  const transitionMs = Math.max(
    1000,
    Math.min(15000, Math.floor(phaseDuration * 0.2)),
  );

  if (elapsed >= phaseDuration - transitionMs) {
    const t = (elapsed - (phaseDuration - transitionMs)) / transitionMs;
    return dayNight.phase === "night" ? 1 - t : t;
  }

  return dayNight.phase === "night" ? 1 : 0;
}

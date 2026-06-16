/** Authored simulation tick counts assume this server tick rate. */
export const REFERENCE_SIMULATION_TICK_RATE = 20;

/** Scales JSON-authored tick counts to the active server tick rate. */
export function scaleAuthoredSimulationTicks(
  authoredTicks: number,
  tickRate: number,
): number {
  return Math.max(
    1,
    Math.round((authoredTicks * tickRate) / REFERENCE_SIMULATION_TICK_RATE),
  );
}

/** Converts wall-clock milliseconds since a snapshot into simulation ticks. */
export function wallMsToSimulationTicks(
  wallMs: number,
  tickRate: number,
  simulationSpeedMultiplier: number,
): number {
  return (wallMs / 1000) * tickRate * simulationSpeedMultiplier;
}

/** Same as {@link wallMsToSimulationTicks} using tickRate × simulationSpeedMultiplier. */
export function wallMsToEffectiveSimulationTicks(
  wallMs: number,
  effectiveSimulationTickRate: number,
): number {
  return (wallMs / 1000) * effectiveSimulationTickRate;
}

/** Converts simulation ticks into wall-clock seconds. */
export function simulationTicksToWallSeconds(
  ticks: number,
  tickRate: number,
  simulationSpeedMultiplier: number,
): number {
  return ticks / (tickRate * simulationSpeedMultiplier);
}

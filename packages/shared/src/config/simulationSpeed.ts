/** Gameplay tick rate scaled by server simulation speed (e.g. 10 TPS × 2 = 20 feel). */
export function getEffectiveSimulationTickRate(options: {
  tickRate: number;
  simulationSpeedMultiplier: number;
}): number {
  return options.tickRate * options.simulationSpeedMultiplier;
}

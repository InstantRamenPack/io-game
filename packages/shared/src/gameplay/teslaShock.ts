export const TESLA_SHOCK_RADIUS = 140;
export const TESLA_SHOCK_DAMAGE = 10;
export const TESLA_STUN_TICKS = 20;
/** Shock ring expansion speed in world units per simulation tick. */
export const TESLA_WAVE_SPEED_PX_PER_TICK = 6;

export function getTeslaShockWaveDurationTicks(): number {
  return Math.ceil(TESLA_SHOCK_RADIUS / TESLA_WAVE_SPEED_PX_PER_TICK);
}

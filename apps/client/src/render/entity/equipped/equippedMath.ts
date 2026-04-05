export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function getOrbitRadius(holdOffset: { x: number; y: number }): number {
  const sourceRadius = Math.hypot(holdOffset.x, holdOffset.y);
  return Math.max(8, Math.min(16, 8 + sourceRadius * 0.28));
}

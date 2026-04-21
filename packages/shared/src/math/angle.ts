const TAU = Math.PI * 2;

export function normalizeAngle(theta: number): number {
  if (!Number.isFinite(theta)) {
    return 0;
  }

  let normalized = theta % TAU;
  if (normalized <= -Math.PI) {
    normalized += TAU;
  } else if (normalized > Math.PI) {
    normalized -= TAU;
  }
  return normalized;
}

export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + shortestAngleDelta(from, to) * t);
}

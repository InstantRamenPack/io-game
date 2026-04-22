type InterceptInput = {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  targetVx: number;
  targetVy: number;
  projectileSpeed: number;
  leadBlendFactor?: number;
};

const QUADRATIC_EPSILON = 1e-6;

export function solveInterceptTime({
  originX,
  originY,
  targetX,
  targetY,
  targetVx,
  targetVy,
  projectileSpeed,
}: InterceptInput): number | null {
  if (!Number.isFinite(projectileSpeed) || projectileSpeed <= 0) {
    return null;
  }

  const relativeX = targetX - originX;
  const relativeY = targetY - originY;
  const targetSpeedSquared = targetVx * targetVx + targetVy * targetVy;
  const projectileSpeedSquared = projectileSpeed * projectileSpeed;
  const quadraticA = targetSpeedSquared - projectileSpeedSquared;
  const quadraticB = 2 * (relativeX * targetVx + relativeY * targetVy);
  const quadraticC = relativeX * relativeX + relativeY * relativeY;

  if (Math.abs(quadraticA) <= QUADRATIC_EPSILON) {
    if (Math.abs(quadraticB) <= QUADRATIC_EPSILON) {
      return null;
    }

    const linearTime = -quadraticC / quadraticB;
    return linearTime > 0 ? linearTime : null;
  }

  const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
  if (discriminant < 0) {
    return null;
  }

  const discriminantRoot = Math.sqrt(discriminant);
  const firstTime = (-quadraticB - discriminantRoot) / (2 * quadraticA);
  const secondTime = (-quadraticB + discriminantRoot) / (2 * quadraticA);
  const positiveTimes = [firstTime, secondTime].filter((time) => time > 0);

  return positiveTimes.length > 0 ? Math.min(...positiveTimes) : null;
}

export function resolveInterceptPoint(input: InterceptInput): {
  x: number;
  y: number;
} {
  const interceptTime = solveInterceptTime(input);
  if (interceptTime === null) {
    return { x: input.targetX, y: input.targetY };
  }

  const leadBlendFactor = input.leadBlendFactor ?? 1;
  return {
    x: input.targetX + input.targetVx * interceptTime * leadBlendFactor,
    y: input.targetY + input.targetVy * interceptTime * leadBlendFactor,
  };
}

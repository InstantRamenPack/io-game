import type { ClientWorldState } from "@client/net/ClientWorldState.ts";

/**
 * Interpolates between the two most recent snapshots to produce smooth motion.
 */
export class Interpolator {
  private readonly snapDistance: number;

  constructor(interpolationConfig: InterpolationConfig) {
    this.snapDistance = interpolationConfig.snapDistance;
  }

  updateInterpolation(worldState: ClientWorldState, frameTimeMs: number): void {
    if (!worldState.clientWorld) {
      return;
    }

    const latestAt = worldState.latestSnapshotReceivedAt;
    const previousAt = worldState.previousSnapshotReceivedAt;

    if (latestAt === undefined || previousAt === undefined) {
      for (const entity of worldState.clientWorld.entities) {
        entity.updatePosition(entity.serverX, entity.serverY);
      }
      return;
    }

    const spanMs = Math.max(1, latestAt - previousAt);
    // Stay exactly one observed snapshot interval behind so interpolation
    // always happens across the latest two received snapshots.
    const renderTimeMs = frameTimeMs - spanMs;
    const alpha = clamp((renderTimeMs - previousAt) / spanMs, 0, 1);

    for (const entity of worldState.clientWorld.entities) {
      const deltaX = entity.serverX - entity.prevServerX;
      const deltaY = entity.serverY - entity.prevServerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > this.snapDistance) {
        entity.updatePosition(entity.serverX, entity.serverY);
        continue;
      }

      const newX = lerp(entity.prevServerX, entity.serverX, alpha);
      const newY = lerp(entity.prevServerY, entity.serverY, alpha);
      entity.updatePosition(newX, newY);
    }
  }
}

export type InterpolationConfig = {
  snapDistance: number;
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

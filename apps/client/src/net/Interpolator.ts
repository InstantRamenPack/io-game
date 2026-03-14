import type { ClientWorldState } from "@client/net/ClientWorldState.ts";

/**
 * Interpolates between the two most recent snapshots to produce smooth motion.
 */
export class Interpolator {
  private interpolationConfig: InterpolationConfig;

  constructor(interpolationConfig: InterpolationConfig) {
    this.interpolationConfig = interpolationConfig;
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

    const renderTimeMs = frameTimeMs - this.interpolationConfig.bufferMs;
    const spanMs = Math.max(1, latestAt - previousAt);
    const alpha = clamp((renderTimeMs - previousAt) / spanMs, 0, 1);

    for (const entity of worldState.clientWorld.entities) {
      const deltaX = entity.serverX - entity.prevServerX;
      const deltaY = entity.serverY - entity.prevServerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > this.interpolationConfig.snapDistance) {
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
  bufferMs: number;
  snapDistance: number;
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

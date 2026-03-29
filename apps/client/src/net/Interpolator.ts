import type { ClientWorldState } from "@client/net/ClientWorldState.ts";

/**
 * Interpolates between the two most recent snapshots to produce smooth motion.
 */
export class Interpolator {
  private readonly snapDistance: number;
  private expectedSnapshotMs: number;
  private renderDelayMs: number;
  private lastSnapshotTime?: number;
  private readonly smoothing = 0.1;

  constructor(interpolationConfig: InterpolationConfig) {
    this.snapDistance = interpolationConfig.snapDistance;
    this.expectedSnapshotMs = Math.max(
      1,
      interpolationConfig.expectedSnapshotMs,
    );
    this.renderDelayMs = this.expectedSnapshotMs;
  }

  public setExpectedSnapshotMs(expectedSnapshotMs: number): void {
    this.expectedSnapshotMs = Math.max(1, expectedSnapshotMs);
    this.renderDelayMs = this.expectedSnapshotMs;
  }

  public updateInterpolation(
    worldState: ClientWorldState,
    frameTimeMs: number,
  ): void {
    if (!worldState.clientWorld) {
      return;
    }

    const latestAt = worldState.latestSnapshotReceivedAt;
    const previousAt = worldState.previousSnapshotReceivedAt;

    if (latestAt === undefined || previousAt === undefined) {
      for (const entity of worldState.clientWorld.entities.values()) {
        entity.updatePosition(entity.serverX, entity.serverY);
      }
      return;
    }

    const spanMs = Math.max(1, latestAt - previousAt);
    if (this.lastSnapshotTime !== latestAt) {
      const minDelay = this.expectedSnapshotMs * 0.5;
      const maxDelay = this.expectedSnapshotMs * 2.0;
      const clampedSpan = clamp(spanMs, minDelay, maxDelay);
      this.renderDelayMs = lerp(
        this.renderDelayMs,
        clampedSpan,
        this.smoothing,
      );
      this.lastSnapshotTime = latestAt;
    }

    // Stay roughly one expected snapshot interval behind to smooth
    // over network jitter and bursty delivery.
    const renderTimeMs = frameTimeMs - this.renderDelayMs;
    const alpha = clamp((renderTimeMs - previousAt) / spanMs, 0, 1);

    for (const entity of worldState.clientWorld.entities.values()) {
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
  expectedSnapshotMs: number;
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

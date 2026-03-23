import type {
  ClientWorldState,
  SnapshotCadenceTelemetry,
} from "@client/net/ClientWorldState.ts";

export type InterpolationTelemetry = {
  fallbackSnapshotMs: number;
  observedSnapshotMs: number | null;
  effectiveSnapshotMs: number;
  snapshotJitterMs: number | null;
  renderDelayMs: number;
  sampleCount: number;
};

/**
 * Interpolates between the two most recent snapshots to produce smooth motion.
 */
export class Interpolator {
  private readonly snapDistance: number;
  private fallbackSnapshotMs: number;
  private renderDelayMs: number;
  private lastSnapshotTime?: number;
  private readonly smoothing = 0.1;
  private observedSnapshotMs: number | null = null;
  private snapshotJitterMs: number | null = null;
  private snapshotSampleCount = 0;

  constructor(interpolationConfig: InterpolationConfig) {
    this.snapDistance = interpolationConfig.snapDistance;
    this.fallbackSnapshotMs = Math.max(1, interpolationConfig.fallbackSnapshotMs);
    this.renderDelayMs = this.fallbackSnapshotMs;
  }

  public setFallbackSnapshotMs(fallbackSnapshotMs: number): void {
    this.fallbackSnapshotMs = Math.max(1, fallbackSnapshotMs);
    if (this.lastSnapshotTime === undefined) {
      this.renderDelayMs = this.fallbackSnapshotMs;
    }
  }

  public reset(): void {
    this.renderDelayMs = this.fallbackSnapshotMs;
    this.lastSnapshotTime = undefined;
    this.observedSnapshotMs = null;
    this.snapshotJitterMs = null;
    this.snapshotSampleCount = 0;
  }

  public getTelemetry(): InterpolationTelemetry {
    return {
      fallbackSnapshotMs: this.fallbackSnapshotMs,
      observedSnapshotMs: this.observedSnapshotMs,
      effectiveSnapshotMs: this.observedSnapshotMs ?? this.fallbackSnapshotMs,
      snapshotJitterMs: this.snapshotJitterMs,
      renderDelayMs: this.renderDelayMs,
      sampleCount: this.snapshotSampleCount,
    };
  }

  updateInterpolation(worldState: ClientWorldState, frameTimeMs: number): void {
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

    const cadence = worldState.getSnapshotCadenceTelemetry();
    const observedSnapshotMs = this.resolveObservedSnapshotMs(cadence);
    const effectiveSnapshotMs = observedSnapshotMs ?? this.fallbackSnapshotMs;
    const snapshotJitterMs =
      cadence.sampleCount >= 3 ? Math.max(0, cadence.jitterMs ?? 0) : null;
    const targetRenderDelayMs = clamp(
      effectiveSnapshotMs + (snapshotJitterMs ?? 0),
      effectiveSnapshotMs * 0.75,
      effectiveSnapshotMs * 2.5,
    );

    this.observedSnapshotMs = observedSnapshotMs;
    this.snapshotJitterMs = snapshotJitterMs;
    this.snapshotSampleCount = cadence.sampleCount;

    const spanMs = Math.max(1, latestAt - previousAt);
    if (this.lastSnapshotTime !== latestAt) {
      this.renderDelayMs = lerp(
        this.renderDelayMs,
        targetRenderDelayMs,
        this.smoothing,
      );
      this.lastSnapshotTime = latestAt;
    }

    // Stay roughly one observed snapshot interval behind to smooth
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

  private resolveObservedSnapshotMs(
    cadence: SnapshotCadenceTelemetry,
  ): number | null {
    if (cadence.sampleCount < 3) {
      return null;
    }

    return cadence.smoothedIntervalMs ?? cadence.observedIntervalMs;
  }
}

export type InterpolationConfig = {
  snapDistance: number;
  fallbackSnapshotMs: number;
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

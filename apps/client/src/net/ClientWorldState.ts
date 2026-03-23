import {ClientWorld} from "@client/net/ClientWorld.ts";
import type {PixiRenderer} from "@client/render/PixiRenderer.ts";
import type {WorldSnapshot} from "@shared/net/snapshots.ts";

export type SnapshotCadenceTelemetry = {
  sampleCount: number;
  lastIntervalMs: number | null;
  observedIntervalMs: number | null;
  smoothedIntervalMs: number | null;
  jitterMs: number | null;
};

type SnapshotArrivalSample = {
  tick: number;
  receivedAtMs: number;
};

/**
 * Stores the latest authoritative snapshot received from the server together
 * with the currently active client world and interpolation timing metadata.
 * A renderer is optional so the same type can be used both at runtime and in
 * headless tests.
 */
export class ClientWorldState {
  public latestTick?: number;
  public latestSnapshotReceivedAt?: number;
  public previousSnapshotReceivedAt?: number;
  public clientWorld?: ClientWorld;

  private readonly snapshotArrivalWindowSize = 30;
  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private snapshotArrivalSamples: SnapshotArrivalSample[] = [];
  private smoothedSnapshotIntervalMs: number | undefined;

  public constructor(
    pixiRenderer?: PixiRenderer,
    debugHitbox = false,
    debugInterpolationMode = 0,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolationMode = debugInterpolationMode;
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   */
  public pushSnapshot(
    snapshot: WorldSnapshot,
    receivedAt: number = performance.now(),
  ): void {
    this.previousSnapshotReceivedAt = this.latestSnapshotReceivedAt;
    this.latestTick = snapshot.tick;
    this.latestSnapshotReceivedAt = receivedAt;
    this.recordSnapshotArrival(snapshot.tick, receivedAt);

    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(
        snapshot,
        this.pixiRenderer,
        this.debugHitbox,
        this.debugInterpolationMode,
      );
    } else {
      this.clientWorld.updateFromSnapshot(snapshot);
    }
  }

  public getSnapshotCadenceTelemetry(): SnapshotCadenceTelemetry {
    const sampleCount = this.snapshotArrivalSamples.length;
    const lastIntervalMs =
      sampleCount >= 2
        ? (this.snapshotArrivalSamples[sampleCount - 1]?.receivedAtMs ?? 0) -
          (this.snapshotArrivalSamples[sampleCount - 2]?.receivedAtMs ?? 0)
        : null;
    const observedIntervalMs =
      sampleCount >= 2
        ? calculateObservedIntervalMs(this.snapshotArrivalSamples)
        : null;
    const jitterMs =
      sampleCount >= 2 && observedIntervalMs !== null
        ? calculateSnapshotJitterMs(this.snapshotArrivalSamples, observedIntervalMs)
        : null;

    return {
      sampleCount,
      lastIntervalMs,
      observedIntervalMs,
      smoothedIntervalMs: this.smoothedSnapshotIntervalMs ?? null,
      jitterMs,
    };
  }

  public clear(): void {
    this.latestTick = undefined;
    this.latestSnapshotReceivedAt = undefined;
    this.previousSnapshotReceivedAt = undefined;
    this.snapshotArrivalSamples = [];
    this.smoothedSnapshotIntervalMs = undefined;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }

  private recordSnapshotArrival(tick: number, receivedAtMs: number): void {
    if (!Number.isFinite(receivedAtMs) || !Number.isFinite(tick)) {
      return;
    }

    const latestSample = this.snapshotArrivalSamples[this.snapshotArrivalSamples.length - 1];
    if (
      latestSample &&
      (tick <= latestSample.tick ||
        receivedAtMs <= latestSample.receivedAtMs ||
        receivedAtMs - latestSample.receivedAtMs > 1_000)
    ) {
      this.snapshotArrivalSamples = [];
      this.smoothedSnapshotIntervalMs = undefined;
    }

    this.snapshotArrivalSamples.push({ tick, receivedAtMs });
    if (this.snapshotArrivalSamples.length > this.snapshotArrivalWindowSize) {
      this.snapshotArrivalSamples.shift();
    }

    const observedIntervalMs = calculateObservedIntervalMs(this.snapshotArrivalSamples);
    if (observedIntervalMs === null) {
      return;
    }

    this.smoothedSnapshotIntervalMs =
      this.smoothedSnapshotIntervalMs === undefined
        ? observedIntervalMs
        : lerp(this.smoothedSnapshotIntervalMs, observedIntervalMs, 0.2);
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function calculatePercentile(values: number[], percentile: number): number {
  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor(percentile * (sortedValues.length - 1))),
  );

  return sortedValues[index] ?? 0;
}

function calculateObservedIntervalMs(
  samples: SnapshotArrivalSample[],
): number | null {
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  if (!firstSample || !lastSample) {
    return null;
  }

  const tickDelta = lastSample.tick - firstSample.tick;
  const elapsedMs = lastSample.receivedAtMs - firstSample.receivedAtMs;
  if (tickDelta <= 0 || elapsedMs <= 0) {
    return null;
  }

  return elapsedMs / tickDelta;
}

function calculateSnapshotJitterMs(
  samples: SnapshotArrivalSample[],
  observedIntervalMs: number,
): number {
  const firstSample = samples[0];
  if (!firstSample || samples.length < 2) {
    return 0;
  }

  const deviationsMs = samples
    .slice(1)
    .map((sample) =>
      Math.abs(
        sample.receivedAtMs -
          (firstSample.receivedAtMs +
            (sample.tick - firstSample.tick) * observedIntervalMs),
      ),
    );

  return calculatePercentile(deviationsMs, 0.75);
}

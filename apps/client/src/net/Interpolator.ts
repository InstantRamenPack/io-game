import type {
  ClientEntity,
  EntityPositionSample,
  EntityServerFrame,
} from "@client/net/ClientEntity.ts";
import type { ClientWorldState } from "@client/net/ClientWorldState.ts";

/**
 * Interpolates entity motion in authoritative tick space while staying roughly
 * one server tick behind the latest accepted snapshot.
 */
export class Interpolator {
  private readonly snapDistance: number;
  private expectedSnapshotMs: number;
  private observedTickMs: number;
  private renderDelayTicks = 1;
  private lastSnapshotTick?: number;
  private readonly smoothing = 0.15;
  private readonly tickDurationSmoothing = 0.2;
  private readonly minRenderDelayTicks = 0.9;
  private readonly maxRenderDelayTicks = 1.2;
  private readonly maxExtrapolationTicks = 0.25;

  constructor(interpolationConfig: InterpolationConfig) {
    this.snapDistance = interpolationConfig.snapDistance;
    this.expectedSnapshotMs = Math.max(
      1,
      interpolationConfig.expectedSnapshotMs,
    );
    this.observedTickMs = this.expectedSnapshotMs;
  }

  public setExpectedSnapshotMs(expectedSnapshotMs: number): void {
    this.expectedSnapshotMs = Math.max(1, expectedSnapshotMs);
    this.observedTickMs = this.expectedSnapshotMs;
    this.renderDelayTicks = 1;
    this.lastSnapshotTick = undefined;
  }

  public updateInterpolation(
    worldState: ClientWorldState,
    frameTimeMs: number,
    deltaMs: number,
  ): void {
    if (!worldState.clientWorld) {
      return;
    }

    const snapshotHistory = worldState.getSnapshotHistory();
    const latestSnapshot = snapshotHistory[snapshotHistory.length - 1];
    const previousSnapshot = snapshotHistory[snapshotHistory.length - 2];

    if (!latestSnapshot || !previousSnapshot) {
      for (const entity of worldState.clientWorld.entities.values()) {
        entity.updatePosition(entity.serverX, entity.serverY);
      }
      return;
    }

    const measuredTickMs = this.measureTickDurationMs(snapshotHistory);
    this.observedTickMs = lerp(
      this.observedTickMs,
      measuredTickMs,
      this.tickDurationSmoothing,
    );

    if (this.lastSnapshotTick !== latestSnapshot.tick) {
      const tickSpan = Math.max(1, latestSnapshot.tick - previousSnapshot.tick);
      const observedDelayTicks = clamp(
        (latestSnapshot.receivedAtMs - previousSnapshot.receivedAtMs) /
          (this.observedTickMs * tickSpan),
        this.minRenderDelayTicks,
        this.maxRenderDelayTicks,
      );
      this.renderDelayTicks = lerp(
        this.renderDelayTicks,
        observedDelayTicks,
        this.smoothing,
      );
      this.lastSnapshotTick = latestSnapshot.tick;
    }

    const estimatedServerTickNow =
      latestSnapshot.tick +
      (frameTimeMs - latestSnapshot.receivedAtMs) / this.observedTickMs;
    const renderTick = estimatedServerTickNow - this.renderDelayTicks;

    for (const entity of worldState.clientWorld.entities.values()) {
      const sample = entity.samplePosition(
        renderTick,
        this.maxExtrapolationTicks,
      );
      if (!sample) {
        entity.updatePosition(entity.serverX, entity.serverY);
        continue;
      }

      const referenceFrame = getReferenceFrame(sample);
      const target = this.computeTargetPosition(entity, sample);
      this.applyCorrection(entity, target.x, target.y, deltaMs, referenceFrame);
    }
  }

  private computeTargetPosition(
    entity: ClientEntity,
    sample: EntityPositionSample,
  ): { x: number; y: number } {
    switch (sample.mode) {
      case "hold":
        return {
          x: sample.frame.x,
          y: sample.frame.y,
        };
      case "extrapolate":
        return {
          x: sample.latest.x + sample.latest.vx * sample.overrunTicks,
          y: sample.latest.y + sample.latest.vy * sample.overrunTicks,
        };
      case "interpolate":
        return this.interpolateBetweenFrames(
          entity,
          sample.previous,
          sample.next,
          sample.alpha,
        );
    }
  }

  private interpolateBetweenFrames(
    entity: ClientEntity,
    previousFrame: EntityServerFrame,
    nextFrame: EntityServerFrame,
    alpha: number,
  ): { x: number; y: number } {
    const linearX = lerp(previousFrame.x, nextFrame.x, alpha);
    const linearY = lerp(previousFrame.y, nextFrame.y, alpha);
    if (this.shouldUseLinearInterpolation(entity, previousFrame, nextFrame)) {
      return { x: linearX, y: linearY };
    }

    const spanTicks = Math.max(1, nextFrame.tick - previousFrame.tick);
    const hermiteX = hermite(
      previousFrame.x,
      nextFrame.x,
      previousFrame.vx,
      nextFrame.vx,
      alpha,
      spanTicks,
    );
    const hermiteY = hermite(
      previousFrame.y,
      nextFrame.y,
      previousFrame.vy,
      nextFrame.vy,
      alpha,
      spanTicks,
    );
    const segmentDistance = Math.hypot(
      nextFrame.x - previousFrame.x,
      nextFrame.y - previousFrame.y,
    );
    const overshootDistance = Math.hypot(
      hermiteX - linearX,
      hermiteY - linearY,
    );
    if (overshootDistance > Math.max(12, segmentDistance * 0.6)) {
      return { x: linearX, y: linearY };
    }

    return { x: hermiteX, y: hermiteY };
  }

  private shouldUseLinearInterpolation(
    entity: ClientEntity,
    previousFrame: EntityServerFrame,
    nextFrame: EntityServerFrame,
  ): boolean {
    if (entity.kind === "projectile") {
      return true;
    }

    const spanTicks = Math.max(1, nextFrame.tick - previousFrame.tick);
    if (spanTicks > 2) {
      return true;
    }

    const previousSpeed = Math.hypot(previousFrame.vx, previousFrame.vy);
    const nextSpeed = Math.hypot(nextFrame.vx, nextFrame.vy);
    const velocityDot =
      previousFrame.vx * nextFrame.vx + previousFrame.vy * nextFrame.vy;
    if (previousSpeed > 0.1 && nextSpeed > 0.1 && velocityDot < 0) {
      return true;
    }

    const segmentDistance = Math.hypot(
      nextFrame.x - previousFrame.x,
      nextFrame.y - previousFrame.y,
    );
    return segmentDistance > this.getHardSnapDistance(entity, nextFrame) * 0.5;
  }

  private applyCorrection(
    entity: ClientEntity,
    targetX: number,
    targetY: number,
    deltaMs: number,
    referenceFrame: EntityServerFrame,
  ): void {
    const errorX = targetX - entity.x;
    const errorY = targetY - entity.y;
    const errorDistance = Math.hypot(errorX, errorY);
    if (errorDistance <= Number.EPSILON) {
      entity.updatePosition(targetX, targetY);
      return;
    }

    const hardSnapDistance = this.getHardSnapDistance(entity, referenceFrame);
    if (errorDistance > hardSnapDistance) {
      entity.updatePosition(targetX, targetY);
      return;
    }

    const maxCorrectionDistance = this.getMaxCorrectionDistance(
      entity,
      deltaMs,
      referenceFrame,
    );
    if (errorDistance <= maxCorrectionDistance) {
      entity.updatePosition(targetX, targetY);
      return;
    }

    const correctionScale = maxCorrectionDistance / errorDistance;
    entity.updatePosition(
      entity.x + errorX * correctionScale,
      entity.y + errorY * correctionScale,
    );
  }

  private getMaxCorrectionDistance(
    entity: ClientEntity,
    deltaMs: number,
    referenceFrame: EntityServerFrame,
  ): number {
    const frameScale = clamp(deltaMs / (1000 / 60), 0.5, 2.5);
    const speed = Math.hypot(referenceFrame.vx, referenceFrame.vy);

    switch (entity.kind) {
      case "projectile":
        return Math.max(32, speed * 1.4) * frameScale;
      case "building":
      case "pickup":
        return 16 * frameScale;
      case "player":
      case "enemy":
        return Math.max(20, speed * 1.3) * frameScale;
    }
  }

  private getHardSnapDistance(
    entity: ClientEntity,
    referenceFrame: EntityServerFrame,
  ): number {
    const speed = Math.hypot(referenceFrame.vx, referenceFrame.vy);
    const kindScale = getKindSnapScale(entity);
    const multiplier = entity.kind === "projectile" ? 1.25 : 1.5;
    return (this.snapDistance * kindScale + speed * 3) * multiplier;
  }

  private measureTickDurationMs(
    snapshotHistory: readonly { tick: number; receivedAtMs: number }[],
  ): number {
    const latestSnapshot = snapshotHistory[snapshotHistory.length - 1];
    const oldestSnapshot = snapshotHistory[0];
    if (!latestSnapshot || !oldestSnapshot) {
      return this.expectedSnapshotMs;
    }

    const elapsedTicks = latestSnapshot.tick - oldestSnapshot.tick;
    if (elapsedTicks <= 0) {
      return this.expectedSnapshotMs;
    }

    const measuredTickMs =
      (latestSnapshot.receivedAtMs - oldestSnapshot.receivedAtMs) / elapsedTicks;
    return clamp(
      measuredTickMs,
      this.expectedSnapshotMs * 0.85,
      this.expectedSnapshotMs * 1.25,
    );
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

function hermite(
  start: number,
  end: number,
  startVelocityPerTick: number,
  endVelocityPerTick: number,
  t: number,
  spanTicks: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const startTangent = startVelocityPerTick * spanTicks;
  const endTangent = endVelocityPerTick * spanTicks;
  return (
    (2 * t3 - 3 * t2 + 1) * start +
    (t3 - 2 * t2 + t) * startTangent +
    (-2 * t3 + 3 * t2) * end +
    (t3 - t2) * endTangent
  );
}

function getReferenceFrame(sample: EntityPositionSample): EntityServerFrame {
  switch (sample.mode) {
    case "hold":
      return sample.frame;
    case "extrapolate":
      return sample.latest;
    case "interpolate":
      return sample.next;
  }
}

function getKindSnapScale(entity: ClientEntity): number {
  switch (entity.kind) {
    case "projectile":
      return 2.5;
    case "building":
    case "pickup":
      return 0.65;
    case "player":
    case "enemy":
      return 1;
  }
}

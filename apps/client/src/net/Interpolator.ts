import type {
  ClientEntity,
  EntityPositionSample,
  EntityServerFrame,
} from "@client/net/ClientEntity.ts";
import type { ClientWorldState } from "@client/net/ClientWorldState.ts";

export type InterpolationDebugFrame = {
  frameTimeMs: number;
  deltaMs: number;
  previousSnapshotTick: number | null;
  latestSnapshotTick: number;
  estimatedServerTickNow: number;
  renderTick: number;
  expectedSnapshotMs: number;
  observedTickMs: number;
  renderDelayTicks: number;
  targetRenderDelayTicks: number;
  jitterTicks: number;
  arrivalTickMsEwma: number | null;
  arrivalJitterMsEwma: number;
  playoutDelayMs: number;
  focusEntity: {
    entityId: number;
    entityKind: ClientEntity["kind"];
    sampleMode: EntityPositionSample["mode"] | "snap";
    correctionMode: InterpolationCorrectionMode;
    targetX: number;
    targetY: number;
    renderedX: number;
    renderedY: number;
    serverX: number;
    serverY: number;
    preCorrectionErrorDistance: number;
    remainingErrorDistance: number;
    referenceTick: number | null;
    previousTick: number | null;
    nextTick: number | null;
    alpha: number | null;
    overrunTicks: number | null;
  };
};

type InterpolationCorrectionMode = "follow" | "clamp" | "hard_snap";

/**
 * Interpolates entity motion in authoritative tick space while staying roughly
 * one server tick behind the latest accepted snapshot.
 */
export class Interpolator {
  private snapDistance = 192;
  private expectedSnapshotMs: number;
  private observedTickMs: number;
  private renderDelayTicks = 1;
  private targetRenderDelayTicks = 1;
  private playoutDelayMs = 0;
  private lastSnapshotTick?: number;
  private arrivalTickMsEwma?: number;
  private arrivalJitterMsEwma = 0;
  private renderDelaySmoothing = 0.15;
  private tickDurationSmoothing = 0.2;
  private minRenderDelayTicks = 0.9;
  private maxRenderDelayTicks = 1.2;
  private maxExtrapolationTicks = 0.25;
  private tickDurationMinFactor = 0.85;
  private tickDurationMaxFactor = 1.25;
  private arrivalEwmaSmoothing = 0.15;
  private jitterEwmaSmoothing = 0.15;
  private jitterBufferMultiplier = 2;
  private jitterBufferSafetyMs = 8;
  private maxDebugLogEntries = 600;
  private correctionFollowSharpness = 18;
  private correctionEpsilon = 0.01;
  private correctionFrameScaleMin = 0.5;
  private correctionFrameScaleMax = 2.5;
  private readonly debugLog: InterpolationDebugFrame[] = [];

  constructor(interpolationConfig: InterpolationConfig) {
    this.expectedSnapshotMs = Math.max(
      1,
      interpolationConfig.expectedSnapshotMs,
    );
    this.observedTickMs = this.expectedSnapshotMs;
    this.setConfig(interpolationConfig);
  }

  public setConfig(interpolationConfig: InterpolationConfig): void {
    this.snapDistance = Math.max(0, interpolationConfig.snapDistance);
    this.tickDurationSmoothing = clamp(
      interpolationConfig.tickDurationSmoothing,
      0.001,
      1,
    );
    this.renderDelaySmoothing = clamp(
      interpolationConfig.renderDelaySmoothing,
      0.001,
      1,
    );
    this.minRenderDelayTicks = Math.max(
      0,
      interpolationConfig.minRenderDelayTicks,
    );
    this.maxRenderDelayTicks = Math.max(
      this.minRenderDelayTicks,
      interpolationConfig.maxRenderDelayTicks,
    );
    this.maxExtrapolationTicks = Math.max(
      0,
      interpolationConfig.maxExtrapolationTicks,
    );
    this.tickDurationMinFactor = clamp(
      interpolationConfig.tickDurationMinFactor,
      0.05,
      5,
    );
    this.tickDurationMaxFactor = Math.max(
      this.tickDurationMinFactor + 0.01,
      interpolationConfig.tickDurationMaxFactor,
    );
    this.arrivalEwmaSmoothing = clamp(
      interpolationConfig.arrivalEwmaSmoothing,
      0.001,
      1,
    );
    this.jitterEwmaSmoothing = clamp(
      interpolationConfig.jitterEwmaSmoothing,
      0.001,
      1,
    );
    this.jitterBufferMultiplier = Math.max(
      0,
      interpolationConfig.jitterBufferMultiplier,
    );
    this.jitterBufferSafetyMs = Math.max(
      0,
      interpolationConfig.jitterBufferSafetyMs,
    );
    this.maxDebugLogEntries = Math.max(
      100,
      Math.floor(interpolationConfig.maxDebugLogEntries),
    );
    this.correctionFollowSharpness = Math.max(
      0.01,
      interpolationConfig.correctionFollowSharpness,
    );
    this.correctionEpsilon = Math.max(0, interpolationConfig.correctionEpsilon);
    this.correctionFrameScaleMin = Math.max(
      0.01,
      interpolationConfig.correctionFrameScaleMin,
    );
    this.correctionFrameScaleMax = Math.max(
      this.correctionFrameScaleMin,
      interpolationConfig.correctionFrameScaleMax,
    );
    this.expectedSnapshotMs = Math.max(
      1,
      interpolationConfig.expectedSnapshotMs,
    );
    if (this.debugLog.length > this.maxDebugLogEntries) {
      this.debugLog.splice(0, this.debugLog.length - this.maxDebugLogEntries);
    }
    this.resetTimingState();
  }

  public setExpectedSnapshotMs(expectedSnapshotMs: number): void {
    this.expectedSnapshotMs = Math.max(1, expectedSnapshotMs);
    this.resetTimingState();
  }

  private resetTimingState(): void {
    this.observedTickMs = this.expectedSnapshotMs;
    this.renderDelayTicks = clamp(
      1,
      this.minRenderDelayTicks,
      this.maxRenderDelayTicks,
    );
    this.targetRenderDelayTicks = this.renderDelayTicks;
    this.playoutDelayMs = this.renderDelayTicks * this.observedTickMs;
    this.lastSnapshotTick = undefined;
    this.arrivalTickMsEwma = undefined;
    this.arrivalJitterMsEwma = 0;
  }

  public updateInterpolation(
    worldState: ClientWorldState,
    frameTimeMs: number,
    deltaMs: number,
    playerEntityId?: number,
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
        if (playerEntityId !== undefined && entity.id === playerEntityId) {
          this.recordFocusedEntityDebugFrame({
            frameTimeMs,
            deltaMs,
            previousSnapshotTick: worldState.latestTick ?? null,
            latestSnapshotTick: worldState.latestTick ?? 0,
            estimatedServerTickNow: worldState.latestTick ?? 0,
            renderTick: worldState.latestTick ?? 0,
            expectedSnapshotMs: this.expectedSnapshotMs,
            observedTickMs: this.observedTickMs,
            renderDelayTicks: this.renderDelayTicks,
            targetRenderDelayTicks: this.targetRenderDelayTicks,
            jitterTicks: Math.max(0, this.renderDelayTicks - 1),
            arrivalTickMsEwma: this.arrivalTickMsEwma ?? null,
            arrivalJitterMsEwma: this.arrivalJitterMsEwma,
            playoutDelayMs: this.playoutDelayMs,
            entity,
            sampleMode: "snap",
            correctionMode: "hard_snap",
            targetX: entity.serverX,
            targetY: entity.serverY,
            preCorrectionErrorDistance: 0,
            referenceTick: worldState.latestTick ?? null,
            previousTick: null,
            nextTick: null,
            alpha: null,
            overrunTicks: null,
          });
        }
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
      const arrivalTickMs = Math.max(
        1,
        (latestSnapshot.receivedAtMs - previousSnapshot.receivedAtMs) /
          tickSpan,
      );
      this.updateArrivalStats(arrivalTickMs);
      this.targetRenderDelayTicks = this.computeTargetRenderDelayTicks();
      this.renderDelayTicks = lerp(
        this.renderDelayTicks,
        this.targetRenderDelayTicks,
        this.renderDelaySmoothing,
      );
      this.renderDelayTicks = clamp(
        this.renderDelayTicks,
        this.minRenderDelayTicks,
        this.maxRenderDelayTicks,
      );
      this.playoutDelayMs = this.targetRenderDelayTicks * this.observedTickMs;
      this.lastSnapshotTick = latestSnapshot.tick;
    }

    const estimatedServerTickNow =
      latestSnapshot.tick +
      (frameTimeMs - latestSnapshot.receivedAtMs) / this.observedTickMs;
    const renderTick = estimatedServerTickNow - this.renderDelayTicks;
    const jitterTicks = Math.max(0, this.targetRenderDelayTicks - 1);

    for (const entity of worldState.clientWorld.entities.values()) {
      const sample = entity.samplePosition(
        renderTick,
        this.maxExtrapolationTicks,
      );
      if (!sample) {
        entity.updatePosition(entity.serverX, entity.serverY);
        if (playerEntityId !== undefined && entity.id === playerEntityId) {
          this.recordFocusedEntityDebugFrame({
            frameTimeMs,
            deltaMs,
            previousSnapshotTick: previousSnapshot.tick,
            latestSnapshotTick: latestSnapshot.tick,
            estimatedServerTickNow,
            renderTick,
            expectedSnapshotMs: this.expectedSnapshotMs,
            observedTickMs: this.observedTickMs,
            renderDelayTicks: this.renderDelayTicks,
            targetRenderDelayTicks: this.targetRenderDelayTicks,
            jitterTicks,
            arrivalTickMsEwma: this.arrivalTickMsEwma ?? null,
            arrivalJitterMsEwma: this.arrivalJitterMsEwma,
            playoutDelayMs: this.playoutDelayMs,
            entity,
            sampleMode: "snap",
            correctionMode: "hard_snap",
            targetX: entity.serverX,
            targetY: entity.serverY,
            preCorrectionErrorDistance: 0,
            referenceTick: latestSnapshot.tick,
            previousTick: null,
            nextTick: null,
            alpha: null,
            overrunTicks: null,
          });
        }
        continue;
      }

      const referenceFrame = getReferenceFrame(sample);
      const target = this.computeTargetPosition(entity, sample);
      const preCorrectionErrorDistance = Math.hypot(
        target.x - entity.x,
        target.y - entity.y,
      );
      const correctionMode = this.applyCorrection(
        entity,
        target.x,
        target.y,
        deltaMs,
        referenceFrame,
      );
      if (playerEntityId !== undefined && entity.id === playerEntityId) {
        this.recordFocusedEntityDebugFrame({
          frameTimeMs,
          deltaMs,
          previousSnapshotTick: previousSnapshot.tick,
          latestSnapshotTick: latestSnapshot.tick,
          estimatedServerTickNow,
          renderTick,
          expectedSnapshotMs: this.expectedSnapshotMs,
          observedTickMs: this.observedTickMs,
          renderDelayTicks: this.renderDelayTicks,
          targetRenderDelayTicks: this.targetRenderDelayTicks,
          jitterTicks,
          arrivalTickMsEwma: this.arrivalTickMsEwma ?? null,
          arrivalJitterMsEwma: this.arrivalJitterMsEwma,
          playoutDelayMs: this.playoutDelayMs,
          entity,
          sampleMode: sample.mode,
          correctionMode,
          targetX: target.x,
          targetY: target.y,
          preCorrectionErrorDistance,
          referenceTick: referenceFrame.tick,
          previousTick:
            sample.mode === "interpolate" ? sample.previous.tick : null,
          nextTick: sample.mode === "interpolate" ? sample.next.tick : null,
          alpha: sample.mode === "interpolate" ? sample.alpha : null,
          overrunTicks:
            sample.mode === "extrapolate" ? sample.overrunTicks : null,
        });
      }
    }
  }

  public getDebugLog(): readonly InterpolationDebugFrame[] {
    return this.debugLog;
  }

  public clearDebugLog(): void {
    this.debugLog.length = 0;
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
  ): InterpolationCorrectionMode {
    const errorX = targetX - entity.x;
    const errorY = targetY - entity.y;
    const errorDistance = Math.hypot(errorX, errorY);
    if (errorDistance <= this.correctionEpsilon) {
      entity.updatePosition(targetX, targetY);
      return "follow";
    }

    const hardSnapDistance = this.getHardSnapDistance(entity, referenceFrame);
    if (errorDistance > hardSnapDistance) {
      entity.updatePosition(targetX, targetY);
      return "hard_snap";
    }

    const maxCorrectionDistance = this.getMaxCorrectionDistance(
      entity,
      deltaMs,
      referenceFrame,
    );
    const followDistance = Math.min(errorDistance, maxCorrectionDistance);
    const followFactor = this.computeFollowFactor(deltaMs);
    const correctionScale =
      (followDistance / errorDistance) * clamp(followFactor, 0, 1);
    if (correctionScale >= 1 - this.correctionEpsilon) {
      entity.updatePosition(targetX, targetY);
      return "follow";
    }
    entity.updatePosition(
      entity.x + errorX * correctionScale,
      entity.y + errorY * correctionScale,
    );
    return "clamp";
  }

  private getMaxCorrectionDistance(
    entity: ClientEntity,
    deltaMs: number,
    referenceFrame: EntityServerFrame,
  ): number {
    const frameScale = clamp(
      deltaMs / (1000 / 60),
      this.correctionFrameScaleMin,
      this.correctionFrameScaleMax,
    );
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

  private computeFollowFactor(deltaMs: number): number {
    const dtSeconds = Math.max(0, deltaMs) / 1000;
    if (dtSeconds <= 0) {
      return 0;
    }
    return 1 - Math.exp(-this.correctionFollowSharpness * dtSeconds);
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

  private updateArrivalStats(arrivalTickMs: number): void {
    if (this.arrivalTickMsEwma === undefined) {
      this.arrivalTickMsEwma = arrivalTickMs;
      this.arrivalJitterMsEwma = 0;
      return;
    }

    this.arrivalTickMsEwma = lerp(
      this.arrivalTickMsEwma,
      arrivalTickMs,
      this.arrivalEwmaSmoothing,
    );
    const deviationMs = Math.abs(arrivalTickMs - this.arrivalTickMsEwma);
    this.arrivalJitterMsEwma = lerp(
      this.arrivalJitterMsEwma,
      deviationMs,
      this.jitterEwmaSmoothing,
    );
  }

  private computeTargetRenderDelayTicks(): number {
    const arrivalTickMs = this.arrivalTickMsEwma ?? this.expectedSnapshotMs;
    const playoutDelayMs =
      arrivalTickMs +
      this.jitterBufferMultiplier * this.arrivalJitterMsEwma +
      this.jitterBufferSafetyMs;
    this.playoutDelayMs = playoutDelayMs;
    return clamp(
      playoutDelayMs / Math.max(1, this.observedTickMs),
      this.minRenderDelayTicks,
      this.maxRenderDelayTicks,
    );
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
      (latestSnapshot.receivedAtMs - oldestSnapshot.receivedAtMs) /
      elapsedTicks;
    return clamp(
      measuredTickMs,
      this.expectedSnapshotMs * this.tickDurationMinFactor,
      this.expectedSnapshotMs * this.tickDurationMaxFactor,
    );
  }

  private recordDebugFrame(frame: InterpolationDebugFrame): void {
    this.debugLog.push(frame);
    if (this.debugLog.length > this.maxDebugLogEntries) {
      this.debugLog.splice(0, this.debugLog.length - this.maxDebugLogEntries);
    }
  }

  private recordFocusedEntityDebugFrame({
    frameTimeMs,
    deltaMs,
    previousSnapshotTick,
    latestSnapshotTick,
    estimatedServerTickNow,
    renderTick,
    expectedSnapshotMs,
    observedTickMs,
    renderDelayTicks,
    targetRenderDelayTicks,
    jitterTicks,
    arrivalTickMsEwma,
    arrivalJitterMsEwma,
    playoutDelayMs,
    entity,
    sampleMode,
    correctionMode,
    targetX,
    targetY,
    preCorrectionErrorDistance,
    referenceTick,
    previousTick,
    nextTick,
    alpha,
    overrunTicks,
  }: {
    frameTimeMs: number;
    deltaMs: number;
    previousSnapshotTick: number | null;
    latestSnapshotTick: number;
    estimatedServerTickNow: number;
    renderTick: number;
    expectedSnapshotMs: number;
    observedTickMs: number;
    renderDelayTicks: number;
    targetRenderDelayTicks: number;
    jitterTicks: number;
    arrivalTickMsEwma: number | null;
    arrivalJitterMsEwma: number;
    playoutDelayMs: number;
    entity: ClientEntity;
    sampleMode: EntityPositionSample["mode"] | "snap";
    correctionMode: InterpolationCorrectionMode;
    targetX: number;
    targetY: number;
    preCorrectionErrorDistance: number;
    referenceTick: number | null;
    previousTick: number | null;
    nextTick: number | null;
    alpha: number | null;
    overrunTicks: number | null;
  }): void {
    this.recordDebugFrame({
      frameTimeMs,
      deltaMs,
      previousSnapshotTick,
      latestSnapshotTick,
      estimatedServerTickNow,
      renderTick,
      expectedSnapshotMs,
      observedTickMs,
      renderDelayTicks,
      targetRenderDelayTicks,
      jitterTicks,
      arrivalTickMsEwma,
      arrivalJitterMsEwma,
      playoutDelayMs,
      focusEntity: {
        entityId: entity.id,
        entityKind: entity.kind,
        sampleMode,
        correctionMode,
        targetX,
        targetY,
        renderedX: entity.x,
        renderedY: entity.y,
        serverX: entity.serverX,
        serverY: entity.serverY,
        preCorrectionErrorDistance,
        remainingErrorDistance: Math.hypot(
          targetX - entity.x,
          targetY - entity.y,
        ),
        referenceTick,
        previousTick,
        nextTick,
        alpha,
        overrunTicks,
      },
    });
  }
}

type InterpolationConfig = {
  snapDistance: number;
  expectedSnapshotMs: number;
  tickDurationSmoothing: number;
  renderDelaySmoothing: number;
  minRenderDelayTicks: number;
  maxRenderDelayTicks: number;
  maxExtrapolationTicks: number;
  tickDurationMinFactor: number;
  tickDurationMaxFactor: number;
  arrivalEwmaSmoothing: number;
  jitterEwmaSmoothing: number;
  jitterBufferMultiplier: number;
  jitterBufferSafetyMs: number;
  maxDebugLogEntries: number;
  correctionFollowSharpness: number;
  correctionEpsilon: number;
  correctionFrameScaleMin: number;
  correctionFrameScaleMax: number;
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

import type {
  ClientEntity,
  EntityPositionSample,
  EntityServerFrame,
} from "@client/net/ClientEntity.ts";
import type { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { lerpAngle } from "@shared/math/angle.ts";

const SERVER_DELAYED_PROJECTILE_TYPE_IDS = new Set<string>([
  "projectile:homing_drone",
]);

export type InterpolationMode =
  | "none"
  | "hold"
  | "interpolate"
  | "extrapolate"
  | "snap";

export type InterpolationDebugFrame = {
  frameTimeMs: number;
  deltaMs: number;
  currentServerTick: number | null;
  latestReceivedSnapshotTick: number | null;
  renderTick: number | null;
  snapshotArrivalIntervalMs: number | null;
  jitterEstimateMs: number;
  renderDelayTicks: number;
  targetRenderDelayTicks: number;
  interpolationMode: InterpolationMode;
  correctionDistance: number;
  correctionDirectionX: number;
  correctionDirectionY: number;
  snapCount: number;
  extrapolatedFrameCount: number;
  heldFrameCount: number;
  interpolatedFrameCount: number;
  duplicateSnapshotCount: number;
  outOfOrderSnapshotCount: number;
  localPlayer: {
    entityId: number;
    authoritativeX: number;
    authoritativeY: number;
    renderedX: number;
    renderedY: number;
    vx: number;
    vy: number;
    referenceTick: number | null;
    previousTick: number | null;
    nextTick: number | null;
    alpha: number | null;
    overrunTicks: number | null;
  } | null;
};

type InterpolationConfig = {
  snapDistance: number;
  expectedSnapshotMs: number;
  tickDurationSmoothing?: number;
  renderDelaySmoothing?: number;
  minRenderDelayTicks?: number;
  maxRenderDelayTicks?: number;
  maxExtrapolationTicks?: number;
  tickDurationMinFactor?: number;
  tickDurationMaxFactor?: number;
  arrivalEwmaSmoothing?: number;
  jitterEwmaSmoothing?: number;
  jitterBufferMultiplier?: number;
  jitterBufferSafetyMs?: number;
  maxDebugLogEntries?: number;
};

export class Interpolator {
  private snapDistance = 192;
  private expectedSnapshotMs: number;
  private observedTickMs: number;
  private renderDelayTicks = 2;
  private targetRenderDelayTicks = 2;
  private lastSnapshotTick?: number;
  private arrivalTickMsEwma?: number;
  private arrivalJitterMsEwma = 0;
  private tickDurationSmoothing = 0.2;
  private renderDelaySmoothing = 0.15;
  private minRenderDelayTicks = 2;
  private maxRenderDelayTicks = 5;
  private maxExtrapolationTicks = 0.35;
  private tickDurationMinFactor = 0.7;
  private tickDurationMaxFactor = 1.4;
  private arrivalEwmaSmoothing = 0.12;
  private jitterEwmaSmoothing = 0.12;
  private jitterBufferMultiplier = 3;
  private jitterBufferSafetyMs = 35;
  private maxDebugLogEntries = 600;
  private snapCount = 0;
  private extrapolatedFrameCount = 0;
  private heldFrameCount = 0;
  private interpolatedFrameCount = 0;
  private renderTickPlayhead: number | null = null;
  private readonly renderedEntityIds = new Set<number>();
  private readonly snappedDiscontinuityTickByEntityId = new Map<
    number,
    number
  >();
  private readonly debugLog: InterpolationDebugFrame[] = [];
  private latestDebugFrame: InterpolationDebugFrame | null = null;

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
    this.expectedSnapshotMs = Math.max(
      1,
      interpolationConfig.expectedSnapshotMs,
    );
    this.tickDurationSmoothing = clamp01(
      interpolationConfig.tickDurationSmoothing ?? this.tickDurationSmoothing,
    );
    this.renderDelaySmoothing = clamp01(
      interpolationConfig.renderDelaySmoothing ?? this.renderDelaySmoothing,
    );
    this.minRenderDelayTicks = Math.max(
      0,
      interpolationConfig.minRenderDelayTicks ?? this.minRenderDelayTicks,
    );
    this.maxRenderDelayTicks = Math.max(
      this.minRenderDelayTicks,
      interpolationConfig.maxRenderDelayTicks ?? this.maxRenderDelayTicks,
    );
    this.maxExtrapolationTicks = Math.max(
      0,
      interpolationConfig.maxExtrapolationTicks ?? this.maxExtrapolationTicks,
    );
    this.tickDurationMinFactor = Math.max(
      0.1,
      interpolationConfig.tickDurationMinFactor ?? this.tickDurationMinFactor,
    );
    this.tickDurationMaxFactor = Math.max(
      this.tickDurationMinFactor + 0.01,
      interpolationConfig.tickDurationMaxFactor ?? this.tickDurationMaxFactor,
    );
    this.arrivalEwmaSmoothing = clamp01(
      interpolationConfig.arrivalEwmaSmoothing ?? this.arrivalEwmaSmoothing,
    );
    this.jitterEwmaSmoothing = clamp01(
      interpolationConfig.jitterEwmaSmoothing ?? this.jitterEwmaSmoothing,
    );
    this.jitterBufferMultiplier = Math.max(
      0,
      interpolationConfig.jitterBufferMultiplier ?? this.jitterBufferMultiplier,
    );
    this.jitterBufferSafetyMs = Math.max(
      0,
      interpolationConfig.jitterBufferSafetyMs ?? this.jitterBufferSafetyMs,
    );
    this.maxDebugLogEntries = Math.max(
      100,
      Math.floor(
        interpolationConfig.maxDebugLogEntries ?? this.maxDebugLogEntries,
      ),
    );
    this.resetTimingState();
  }

  public updateInterpolation(
    worldState: ClientWorldState,
    frameTimeMs: number,
    deltaMs: number,
    focusEntityId?: number,
  ): void {
    const world = worldState.clientWorld;
    if (!world) {
      return;
    }

    const snapshotHistory = worldState.getSnapshotHistory();
    const latestSnapshot = snapshotHistory[snapshotHistory.length - 1];
    const previousSnapshot = snapshotHistory[snapshotHistory.length - 2];

    if (!latestSnapshot) {
      this.recordDebugFrame(
        worldState,
        frameTimeMs,
        deltaMs,
        null,
        "none",
        0,
        {
          x: 0,
          y: 0,
        },
        focusEntityId,
      );
      return;
    }

    if (previousSnapshot) {
      this.updateTiming(snapshotHistory, latestSnapshot, previousSnapshot);
    }

    const estimatedServerTickNow =
      latestSnapshot.tick +
      (frameTimeMs - latestSnapshot.receivedAtMs) / this.expectedSnapshotMs;
    const renderTick = this.updateRenderTickPlayhead(
      estimatedServerTickNow - this.renderDelayTicks,
      deltaMs,
    );
    let focusMode: InterpolationMode = "none";
    let focusCorrectionDistance = 0;
    let focusCorrectionDirection = { x: 0, y: 0 };

    for (const entity of world.entities.values()) {
      const beforeX = entity.x;
      const beforeY = entity.y;
      const sampleTick = shouldExtrapolateProjectile(entity)
        ? estimatedServerTickNow
        : renderTick;
      const sample = entity.samplePosition(
        sampleTick,
        this.maxExtrapolationTicks,
      );
      if (!sample) {
        entity.updatePosition(entity.serverX, entity.serverY);
        continue;
      }

      const target = this.computeTargetPosition(sample);
      const targetRotation = this.computeTargetRotation(sample);
      const referenceFrame = getReferenceFrame(sample);
      const mode = this.resolveMode(entity, sample, referenceFrame);
      this.countMode(mode);

      entity.updatePosition(target.x, target.y);
      entity.rotation = targetRotation;
      this.renderedEntityIds.add(entity.id);

      if (entity.id === focusEntityId) {
        const correctionX = target.x - beforeX;
        const correctionY = target.y - beforeY;
        focusCorrectionDistance = Math.hypot(correctionX, correctionY);
        focusCorrectionDirection =
          focusCorrectionDistance <= Number.EPSILON
            ? { x: 0, y: 0 }
            : {
                x: correctionX / focusCorrectionDistance,
                y: correctionY / focusCorrectionDistance,
              };
        focusMode = mode;
      }
    }

    this.pruneEntityRenderState(world.entities);
    this.recordDebugFrame(
      worldState,
      frameTimeMs,
      deltaMs,
      renderTick,
      focusMode,
      focusCorrectionDistance,
      focusCorrectionDirection,
      focusEntityId,
    );
  }

  public getDebugLog(): readonly InterpolationDebugFrame[] {
    return this.debugLog;
  }

  public getLatestDebugFrame(): InterpolationDebugFrame | null {
    return this.latestDebugFrame;
  }

  public clearDebugLog(): void {
    this.debugLog.length = 0;
    this.latestDebugFrame = null;
    this.snapCount = 0;
    this.extrapolatedFrameCount = 0;
    this.heldFrameCount = 0;
    this.interpolatedFrameCount = 0;
  }

  private resetTimingState(): void {
    this.observedTickMs = this.expectedSnapshotMs;
    this.renderDelayTicks = clamp(
      this.minRenderDelayTicks,
      this.minRenderDelayTicks,
      this.maxRenderDelayTicks,
    );
    this.targetRenderDelayTicks = this.renderDelayTicks;
    this.lastSnapshotTick = undefined;
    this.arrivalTickMsEwma = undefined;
    this.arrivalJitterMsEwma = 0;
    this.renderTickPlayhead = null;
  }

  private updateRenderTickPlayhead(
    targetRenderTick: number,
    deltaMs: number,
  ): number {
    if (this.renderTickPlayhead === null) {
      this.renderTickPlayhead = targetRenderTick;
      return this.renderTickPlayhead;
    }

    const normalAdvanceTicks = Math.max(0, deltaMs / this.expectedSnapshotMs);
    const nextTick = this.renderTickPlayhead + normalAdvanceTicks;
    const driftTicks = targetRenderTick - nextTick;
    const correctionLimit = Math.max(0.02, normalAdvanceTicks * 0.35);
    const correctionTicks = clamp(
      driftTicks * 0.08,
      -correctionLimit,
      correctionLimit,
    );
    this.renderTickPlayhead = nextTick + correctionTicks;
    return this.renderTickPlayhead;
  }

  private updateTiming(
    snapshotHistory: readonly { tick: number; receivedAtMs: number }[],
    latestSnapshot: { tick: number; receivedAtMs: number },
    previousSnapshot: { tick: number; receivedAtMs: number },
  ): void {
    const measuredTickMs = this.measureTickDurationMs(snapshotHistory);
    this.observedTickMs = lerp(
      this.observedTickMs,
      measuredTickMs,
      this.tickDurationSmoothing,
    );

    if (this.lastSnapshotTick === latestSnapshot.tick) {
      return;
    }

    const tickSpan = Math.max(1, latestSnapshot.tick - previousSnapshot.tick);
    const arrivalTickMs = Math.max(
      1,
      (latestSnapshot.receivedAtMs - previousSnapshot.receivedAtMs) / tickSpan,
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
    this.lastSnapshotTick = latestSnapshot.tick;
  }

  private computeTargetPosition(sample: EntityPositionSample): {
    x: number;
    y: number;
  } {
    switch (sample.mode) {
      case "hold":
        return { x: sample.frame.x, y: sample.frame.y };
      case "extrapolate":
        return {
          x: sample.latest.x + sample.latest.vx * sample.overrunTicks,
          y: sample.latest.y + sample.latest.vy * sample.overrunTicks,
        };
      case "interpolate":
        return interpolateBetweenFrames(
          sample.previous,
          sample.next,
          sample.alpha,
        );
    }
  }

  private computeTargetRotation(sample: EntityPositionSample): number {
    switch (sample.mode) {
      case "hold":
        return sample.frame.rotation;
      case "extrapolate":
        return sample.latest.rotation;
      case "interpolate":
        return lerpAngle(
          sample.previous.rotation,
          sample.next.rotation,
          sample.alpha,
        );
    }
  }

  private resolveMode(
    entity: ClientEntity,
    sample: EntityPositionSample,
    referenceFrame: EntityServerFrame,
  ): InterpolationMode {
    if (
      this.renderedEntityIds.has(entity.id) &&
      entity.lastDiscontinuityTick === referenceFrame.tick
    ) {
      const lastSnappedTick = this.snappedDiscontinuityTickByEntityId.get(
        entity.id,
      );
      if (lastSnappedTick !== referenceFrame.tick) {
        this.snappedDiscontinuityTickByEntityId.set(
          entity.id,
          referenceFrame.tick,
        );
        return "snap";
      }
    }
    return sample.mode;
  }

  private pruneEntityRenderState(
    entities: ReadonlyMap<number, ClientEntity>,
  ): void {
    for (const entityId of this.renderedEntityIds) {
      if (entities.has(entityId)) {
        continue;
      }
      this.renderedEntityIds.delete(entityId);
      this.snappedDiscontinuityTickByEntityId.delete(entityId);
    }
  }

  private countMode(mode: InterpolationMode): void {
    switch (mode) {
      case "snap":
        this.snapCount += 1;
        return;
      case "extrapolate":
        this.extrapolatedFrameCount += 1;
        return;
      case "hold":
        this.heldFrameCount += 1;
        return;
      case "interpolate":
        this.interpolatedFrameCount += 1;
        return;
      case "none":
        return;
    }
  }

  private recordDebugFrame(
    worldState: ClientWorldState,
    frameTimeMs: number,
    deltaMs: number,
    renderTick: number | null,
    interpolationMode: InterpolationMode,
    correctionDistance: number,
    correctionDirection: { x: number; y: number },
    focusEntityId: number | undefined,
  ): void {
    const world = worldState.clientWorld;
    const localPlayer =
      focusEntityId === undefined
        ? undefined
        : world?.entities.get(focusEntityId);
    const sample =
      localPlayer && renderTick !== null
        ? localPlayer.samplePosition(renderTick, this.maxExtrapolationTicks)
        : null;
    const snapshotStats = worldState.getSnapshotReceiveStats();
    const frame: InterpolationDebugFrame = {
      frameTimeMs,
      deltaMs,
      currentServerTick: world?.tick ?? null,
      latestReceivedSnapshotTick: worldState.latestTick ?? null,
      renderTick,
      snapshotArrivalIntervalMs: snapshotStats.latestArrivalIntervalMs,
      jitterEstimateMs: this.arrivalJitterMsEwma,
      renderDelayTicks: this.renderDelayTicks,
      targetRenderDelayTicks: this.targetRenderDelayTicks,
      interpolationMode,
      correctionDistance,
      correctionDirectionX: correctionDirection.x,
      correctionDirectionY: correctionDirection.y,
      snapCount: this.snapCount,
      extrapolatedFrameCount: this.extrapolatedFrameCount,
      heldFrameCount: this.heldFrameCount,
      interpolatedFrameCount: this.interpolatedFrameCount,
      duplicateSnapshotCount: snapshotStats.duplicateSnapshotCount,
      outOfOrderSnapshotCount: snapshotStats.outOfOrderSnapshotCount,
      localPlayer: localPlayer
        ? {
            entityId: localPlayer.id,
            authoritativeX: localPlayer.serverX,
            authoritativeY: localPlayer.serverY,
            renderedX: localPlayer.x,
            renderedY: localPlayer.y,
            vx: localPlayer.vx,
            vy: localPlayer.vy,
            referenceTick: sample ? getReferenceFrame(sample).tick : null,
            previousTick:
              sample?.mode === "interpolate" ? sample.previous.tick : null,
            nextTick: sample?.mode === "interpolate" ? sample.next.tick : null,
            alpha: sample?.mode === "interpolate" ? sample.alpha : null,
            overrunTicks:
              sample?.mode === "extrapolate" ? sample.overrunTicks : null,
          }
        : null,
    };
    this.latestDebugFrame = frame;
    this.debugLog.push(frame);
    if (this.debugLog.length > this.maxDebugLogEntries) {
      this.debugLog.splice(0, this.debugLog.length - this.maxDebugLogEntries);
    }
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
    return clamp(
      playoutDelayMs / this.expectedSnapshotMs,
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
}

function interpolateBetweenFrames(
  previousFrame: EntityServerFrame,
  nextFrame: EntityServerFrame,
  alpha: number,
): { x: number; y: number } {
  return {
    x: lerp(previousFrame.x, nextFrame.x, alpha),
    y: lerp(previousFrame.y, nextFrame.y, alpha),
  };
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

function shouldExtrapolateProjectile(entity: ClientEntity): boolean {
  return (
    entity.kind === "projectile" &&
    !SERVER_DELAYED_PROJECTILE_TYPE_IDS.has(entity.typeId)
  );
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return clamp(value, 0, 1);
}

import type { InterpolationDebugFrame } from "@client/net/Interpolator.ts";

export type MotionSample = {
  timeMs: number;
  x: number;
  y: number;
};

export type FrameMotionDiagnostics = {
  frameIndex: number;
  timeMs: number;
  x: number;
  y: number;
  velocity: number;
  acceleration: number;
  jerk: number;
  mode?: string;
  renderDelayTicks?: number;
};

export type SmoothnessMetrics = {
  sampleCount: number;

  positionResidualRms: number;
  positionMaxStep: number;

  velocityMean: number;
  velocityMedian: number;
  velocityStdDev: number;
  velocityCoeffVar: number;
  velocityP95AbsDelta: number;
  velocityMaxAbsDelta: number;

  accelerationRms: number;
  accelerationP95: number;
  accelerationMax: number;

  jerkRms: number;
  jerkP95: number;
  jerkMax: number;

  freezeFrameCount: number;
  reverseFrameCount: number;
  largeStepCount: number;

  worstFrames: FrameMotionDiagnostics[];
};

type SmoothnessOptions = {
  freezeEpsilon?: number;
  largeStepMultiplier?: number;
  debugFrames?: InterpolationDebugFrame[];
};

export function computeSmoothnessMetrics(
  samples: MotionSample[],
  expectedDirection: { x: number; y: number },
  options: SmoothnessOptions = {},
): SmoothnessMetrics {
  if (samples.length === 0) {
    return emptySmoothness();
  }

  const directionMagnitude = Math.hypot(
    expectedDirection.x,
    expectedDirection.y,
  );
  const direction =
    directionMagnitude > 0
      ? {
          x: expectedDirection.x / directionMagnitude,
          y: expectedDirection.y / directionMagnitude,
        }
      : { x: 1, y: 0 };

  const freezeEpsilon = options.freezeEpsilon ?? 0.05;
  const largeStepMultiplier = options.largeStepMultiplier ?? 6;

  const velocities: number[] = [];
  const acceleration: number[] = [];
  const jerk: number[] = [];
  const velocityDeltas: number[] = [];
  const positionSteps: number[] = [];
  const diagnostics: FrameMotionDiagnostics[] = [];

  let previousVelocity = 0;
  let previousAcceleration = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const previousSample = samples[index - 1];
    let velocity = 0;
    let accel = 0;
    let jerkValue = 0;
    if (previousSample) {
      const dtSeconds = Math.max(
        1e-6,
        (sample.timeMs - previousSample.timeMs) / 1000,
      );
      const dx = sample.x - previousSample.x;
      const dy = sample.y - previousSample.y;
      positionSteps.push(Math.hypot(dx, dy));
      velocity = (dx * direction.x + dy * direction.y) / dtSeconds;
      velocities.push(velocity);
      velocityDeltas.push(Math.abs(velocity - previousVelocity));
      accel = (velocity - previousVelocity) / dtSeconds;
      acceleration.push(accel);
      jerkValue = (accel - previousAcceleration) / dtSeconds;
      jerk.push(jerkValue);
      previousVelocity = velocity;
      previousAcceleration = accel;
    }

    const debugFrame = options.debugFrames?.[index];
    diagnostics.push({
      frameIndex: index,
      timeMs: sample.timeMs,
      x: sample.x,
      y: sample.y,
      velocity,
      acceleration: accel,
      jerk: jerkValue,
      mode: debugFrame?.interpolationMode,
      renderDelayTicks: debugFrame?.renderDelayTicks,
    });
  }

  const projectedSamples = samples.map((sample) => ({
    timeMs: sample.timeMs,
    x: sample.x * direction.x + sample.y * direction.y,
    y: 0,
  }));

  const velocityMean = mean(velocities);
  const velocityMedian = median(velocities);
  const velocityStdDev = stdDev(velocities);
  const velocityCoeffVar =
    velocityMean === 0 ? 0 : velocityStdDev / Math.abs(velocityMean);

  const medianVelocityDelta = median(velocityDeltas);
  const largeStepThreshold =
    medianVelocityDelta === 0
      ? Number.POSITIVE_INFINITY
      : medianVelocityDelta * largeStepMultiplier;

  const freezeFrameCount = velocities.filter(
    (value) => Math.abs(value) < freezeEpsilon,
  ).length;
  const reverseFrameCount = velocities.filter((value) => value < 0).length;
  const largeStepCount = velocityDeltas.filter(
    (delta) => delta > largeStepThreshold,
  ).length;

  const worstFrames = [...diagnostics].sort(
    (left, right) => Math.abs(right.jerk) - Math.abs(left.jerk),
  );

  return {
    sampleCount: samples.length,
    positionResidualRms: computeLinearResidualRms(projectedSamples),
    positionMaxStep: positionSteps.length ? Math.max(...positionSteps) : 0,
    velocityMean,
    velocityMedian,
    velocityStdDev,
    velocityCoeffVar,
    velocityP95AbsDelta: percentile(velocityDeltas, 0.95),
    velocityMaxAbsDelta: velocityDeltas.length
      ? Math.max(...velocityDeltas)
      : 0,
    accelerationRms: rms(acceleration),
    accelerationP95: percentile(acceleration.map(Math.abs), 0.95),
    accelerationMax: acceleration.length
      ? Math.max(...acceleration.map(Math.abs))
      : 0,
    jerkRms: rms(jerk),
    jerkP95: percentile(jerk.map(Math.abs), 0.95),
    jerkMax: jerk.length ? Math.max(...jerk.map(Math.abs)) : 0,
    freezeFrameCount,
    reverseFrameCount,
    largeStepCount,
    worstFrames,
  };
}

export function computeLinearResidualRms(samples: MotionSample[]): number {
  if (samples.length < 2) {
    return 0;
  }
  const n = samples.length;
  const meanTime =
    samples.reduce((total, sample) => total + sample.timeMs, 0) / n;
  const meanX = samples.reduce((total, sample) => total + sample.x, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const sample of samples) {
    const timeOffset = sample.timeMs - meanTime;
    covariance += timeOffset * (sample.x - meanX);
    variance += timeOffset * timeOffset;
  }
  const slope = variance <= Number.EPSILON ? 0 : covariance / variance;
  const intercept = meanX - slope * meanTime;
  const residuals = samples.map(
    (sample) => sample.x - (slope * sample.timeMs + intercept),
  );
  return rms(residuals);
}

export function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * (sorted.length - 1))),
  );
  return sorted[index]!;
}

export function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function stdDev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const meanValue = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - meanValue) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

export function summarizeInterpolationModes(
  debugFrames: InterpolationDebugFrame[],
  warmupMs: number,
): {
  interpolateRatio: number;
  holdRatio: number;
  extrapolateRatio: number;
  snapCount: number;
} {
  const frames = debugFrames.filter((frame) => frame.frameTimeMs >= warmupMs);
  const counts = {
    interpolate: 0,
    hold: 0,
    extrapolate: 0,
    snap: 0,
  };
  for (const frame of frames) {
    if (frame.interpolationMode === "interpolate") {
      counts.interpolate += 1;
    } else if (frame.interpolationMode === "hold") {
      counts.hold += 1;
    } else if (frame.interpolationMode === "extrapolate") {
      counts.extrapolate += 1;
    } else if (frame.interpolationMode === "snap") {
      counts.snap += 1;
    }
  }
  const total = counts.interpolate + counts.hold + counts.extrapolate;
  return {
    interpolateRatio: total > 0 ? counts.interpolate / total : 0,
    holdRatio: total > 0 ? counts.hold / total : 0,
    extrapolateRatio: total > 0 ? counts.extrapolate / total : 0,
    snapCount: counts.snap,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function rms(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.sqrt(
    values.reduce((total, value) => total + value * value, 0) /
      values.length,
  );
}

function emptySmoothness(): SmoothnessMetrics {
  return {
    sampleCount: 0,
    positionResidualRms: 0,
    positionMaxStep: 0,
    velocityMean: 0,
    velocityMedian: 0,
    velocityStdDev: 0,
    velocityCoeffVar: 0,
    velocityP95AbsDelta: 0,
    velocityMaxAbsDelta: 0,
    accelerationRms: 0,
    accelerationP95: 0,
    accelerationMax: 0,
    jerkRms: 0,
    jerkP95: 0,
    jerkMax: 0,
    freezeFrameCount: 0,
    reverseFrameCount: 0,
    largeStepCount: 0,
    worstFrames: [],
  };
}

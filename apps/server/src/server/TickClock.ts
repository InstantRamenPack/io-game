/**
 * Fixed-rate timer wrapper used by the authoritative server tick loop.
 * Keeps timer concerns out of GameServer.
 */
type TimedSample = {
  timeMs: number;
  value: number;
};

type NumericSummary = {
  last: number | null;
  average: number | null;
  max: number | null;
};

export type TickClockTelemetrySnapshot = {
  running: boolean;
  targetTickRate: number;
  targetIntervalMs: number;
  telemetryWindowMs: number;
  totalTicks: number;
  uptimeMs: number | null;
  actualTickRate: number | null;
  lastTickAgeMs: number | null;
  schedule: {
    lastIntervalMs: number | null;
    averageIntervalMs: number | null;
    maxIntervalMs: number | null;
    lastIntervalOverrunMs: number | null;
    averageIntervalOverrunMs: number | null;
    maxIntervalOverrunMs: number | null;
    lastWakeDelayMs: number | null;
    averageWakeDelayMs: number | null;
    maxWakeDelayMs: number | null;
    lastWakeTickCount: number | null;
    averageWakeTickCount: number | null;
    maxWakeTickCount: number | null;
    lateTickThresholdMs: number;
    lateTickCount: number;
    lateTickRatio: number | null;
    catchUpTickCount: number;
    droppedTickDebtMs: number;
  };
  work: {
    lastTickDurationMs: number | null;
    averageTickDurationMs: number | null;
    maxTickDurationMs: number | null;
    lastTickBudgetOverrunMs: number | null;
    averageTickBudgetOverrunMs: number | null;
    maxTickBudgetOverrunMs: number | null;
    overBudgetTickCount: number;
    overBudgetTickRatio: number | null;
  };
};

export class TickClock {
  private readonly tickRate: number;
  private readonly intervalMs: number;
  private readonly telemetryWindowMs = 5_000;
  private readonly lateTickThresholdMs: number;
  private readonly maxCatchUpTicksPerWakeup = 4;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tickCallback: (() => void) | undefined;
  private running = false;
  private startedAtMs: number | undefined;
  private totalTicks = 0;
  private lastTickStartedAtMs: number | undefined;
  private nextTickAtMs: number | undefined;
  private tickStartSamples: number[] = [];
  private intervalSamples: TimedSample[] = [];
  private wakeDelaySamples: TimedSample[] = [];
  private wakeTickCountSamples: TimedSample[] = [];
  private durationSamples: TimedSample[] = [];
  private droppedTickDebtMs = 0;

  /**
   * Creates a timer that targets the configured tick rate.
   * @param tickRate Desired simulation ticks per second.
   */
  constructor(tickRate: number) {
    this.tickRate = tickRate;
    this.intervalMs = 1000 / tickRate;
    this.lateTickThresholdMs = Math.max(1, this.intervalMs * 0.1);
  }

  /**
   * Starts periodic callbacks at the configured fixed interval.
   * @param cb Tick callback invoked on each interval.
   */
  start(cb: () => void): void {
    if (this.running) {
      return;
    }

    const startedAtMs = performance.now();
    this.resetTelemetry(startedAtMs);
    this.running = true;
    this.tickCallback = cb;
    this.nextTickAtMs = startedAtMs + this.intervalMs;
    this.scheduleNextWakeup();
  }

  /**
   * Stops the periodic callback loop if it is running.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.tickCallback = undefined;
    this.nextTickAtMs = undefined;
  }

  /**
   * Returns a rolling summary of the observed server tick cadence and work time.
   */
  getTelemetry(): TickClockTelemetrySnapshot {
    const now = performance.now();

    this.trimSamples(now);

    const intervalSummary = summarizeTimedSamples(this.intervalSamples);
    const wakeDelaySummary = summarizeTimedSamples(this.wakeDelaySamples);
    const wakeTickCountSummary = summarizeTimedSamples(this.wakeTickCountSamples);
    const durationSummary = summarizeTimedSamples(this.durationSamples);
    const intervalOverrunSummary = summarizeNumbers(
      this.intervalSamples.map((sample) => Math.max(0, sample.value - this.intervalMs)),
    );
    const tickBudgetOverrunSummary = summarizeNumbers(
      this.durationSamples.map((sample) => Math.max(0, sample.value - this.intervalMs)),
    );
    const lateTickCount = this.wakeDelaySamples.filter(
      (sample) => sample.value > this.lateTickThresholdMs,
    ).length;
    const catchUpTickCount = this.wakeTickCountSamples.reduce(
      (total, sample) => total + Math.max(0, sample.value - 1),
      0,
    );
    const overBudgetTickCount = this.durationSamples.filter((sample) => sample.value > this.intervalMs).length;

    return {
      running: this.running,
      targetTickRate: this.tickRate,
      targetIntervalMs: this.intervalMs,
      telemetryWindowMs: this.telemetryWindowMs,
      totalTicks: this.totalTicks,
      uptimeMs:
        this.startedAtMs === undefined ? null : Math.max(0, now - this.startedAtMs),
      actualTickRate: calculateTickRate(this.tickStartSamples),
      lastTickAgeMs:
        this.lastTickStartedAtMs === undefined
          ? null
          : Math.max(0, now - this.lastTickStartedAtMs),
      schedule: {
        lastIntervalMs: intervalSummary.last,
        averageIntervalMs: intervalSummary.average,
        maxIntervalMs: intervalSummary.max,
        lastIntervalOverrunMs: intervalOverrunSummary.last,
        averageIntervalOverrunMs: intervalOverrunSummary.average,
        maxIntervalOverrunMs: intervalOverrunSummary.max,
        lastWakeDelayMs: wakeDelaySummary.last,
        averageWakeDelayMs: wakeDelaySummary.average,
        maxWakeDelayMs: wakeDelaySummary.max,
        lastWakeTickCount: wakeTickCountSummary.last,
        averageWakeTickCount: wakeTickCountSummary.average,
        maxWakeTickCount: wakeTickCountSummary.max,
        lateTickThresholdMs: this.lateTickThresholdMs,
        lateTickCount,
        lateTickRatio:
          this.wakeDelaySamples.length > 0
            ? lateTickCount / this.wakeDelaySamples.length
            : null,
        catchUpTickCount,
        droppedTickDebtMs: this.droppedTickDebtMs,
      },
      work: {
        lastTickDurationMs: durationSummary.last,
        averageTickDurationMs: durationSummary.average,
        maxTickDurationMs: durationSummary.max,
        lastTickBudgetOverrunMs: tickBudgetOverrunSummary.last,
        averageTickBudgetOverrunMs: tickBudgetOverrunSummary.average,
        maxTickBudgetOverrunMs: tickBudgetOverrunSummary.max,
        overBudgetTickCount,
        overBudgetTickRatio:
          this.durationSamples.length > 0
            ? overBudgetTickCount / this.durationSamples.length
            : null,
      },
    };
  }

  private resetTelemetry(startedAtMs: number): void {
    this.startedAtMs = startedAtMs;
    this.totalTicks = 0;
    this.lastTickStartedAtMs = undefined;
    this.nextTickAtMs = undefined;
    this.tickStartSamples = [];
    this.intervalSamples = [];
    this.wakeDelaySamples = [];
    this.wakeTickCountSamples = [];
    this.durationSamples = [];
    this.droppedTickDebtMs = 0;
  }

  private trimSamples(now: number): void {
    while (
      this.tickStartSamples.length > 1 &&
      now - (this.tickStartSamples[0] ?? now) > this.telemetryWindowMs
    ) {
      this.tickStartSamples.shift();
    }

    while (
      this.intervalSamples.length > 0 &&
      now - (this.intervalSamples[0]?.timeMs ?? now) > this.telemetryWindowMs
    ) {
      this.intervalSamples.shift();
    }

    while (
      this.wakeDelaySamples.length > 0 &&
      now - (this.wakeDelaySamples[0]?.timeMs ?? now) > this.telemetryWindowMs
    ) {
      this.wakeDelaySamples.shift();
    }

    while (
      this.wakeTickCountSamples.length > 0 &&
      now - (this.wakeTickCountSamples[0]?.timeMs ?? now) > this.telemetryWindowMs
    ) {
      this.wakeTickCountSamples.shift();
    }

    while (
      this.durationSamples.length > 0 &&
      now - (this.durationSamples[0]?.timeMs ?? now) > this.telemetryWindowMs
    ) {
      this.durationSamples.shift();
    }
  }

  private scheduleNextWakeup(): void {
    if (!this.running || !this.tickCallback) {
      return;
    }

    const nextTickAtMs = this.nextTickAtMs;
    if (nextTickAtMs === undefined) {
      return;
    }

    const delayMs = Math.max(0, nextTickAtMs - performance.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.runDueTicks();
    }, delayMs);
  }

  private runDueTicks(): void {
    const tickCallback = this.tickCallback;
    if (!this.running || !tickCallback || this.nextTickAtMs === undefined) {
      return;
    }

    const wakeStartedAtMs = performance.now();
    let ticksRunThisWake = 0;

    while (this.running && this.nextTickAtMs !== undefined) {
      const scheduledAtMs: number = this.nextTickAtMs;
      if (performance.now() < scheduledAtMs) {
        break;
      }
      const tickStartedAtMs = performance.now();

      this.recordTickStart(tickStartedAtMs, scheduledAtMs);
      try {
        tickCallback();
      } finally {
        this.recordTickDuration(tickStartedAtMs, performance.now());
      }

      this.nextTickAtMs = scheduledAtMs + this.intervalMs;
      ticksRunThisWake += 1;

      if (ticksRunThisWake >= this.maxCatchUpTicksPerWakeup) {
        const nextTickAtMs = this.nextTickAtMs;
        if (nextTickAtMs === undefined) {
          break;
        }
        const remainingDebtMs = Math.max(0, performance.now() - nextTickAtMs);
        if (remainingDebtMs > 0) {
          this.droppedTickDebtMs += remainingDebtMs;
          this.nextTickAtMs = performance.now() + this.intervalMs;
        }
        break;
      }
    }

    if (ticksRunThisWake > 0) {
      this.wakeTickCountSamples.push({
        timeMs: wakeStartedAtMs,
        value: ticksRunThisWake,
      });
      this.trimSamples(performance.now());
    }

    this.scheduleNextWakeup();
  }

  private recordTickStart(startedAtMs: number, scheduledAtMs: number): void {
    const lastTickStartedAtMs = this.lastTickStartedAtMs;

    this.totalTicks += 1;
    this.lastTickStartedAtMs = startedAtMs;
    this.tickStartSamples.push(startedAtMs);
    this.wakeDelaySamples.push({
      timeMs: startedAtMs,
      value: Math.max(0, startedAtMs - scheduledAtMs),
    });
    if (lastTickStartedAtMs !== undefined) {
      this.intervalSamples.push({
        timeMs: startedAtMs,
        value: startedAtMs - lastTickStartedAtMs,
      });
    }
    this.trimSamples(startedAtMs);
  }

  private recordTickDuration(startedAtMs: number, completedAtMs: number): void {
    this.durationSamples.push({
      timeMs: completedAtMs,
      value: completedAtMs - startedAtMs,
    });
    this.trimSamples(completedAtMs);
  }
}

function calculateTickRate(tickStartSamples: number[]): number | null {
  if (tickStartSamples.length < 2) {
    return null;
  }

  const firstSample = tickStartSamples[0];
  const lastSample = tickStartSamples[tickStartSamples.length - 1];
  if (firstSample === undefined || lastSample === undefined || lastSample <= firstSample) {
    return null;
  }

  return ((tickStartSamples.length - 1) * 1000) / (lastSample - firstSample);
}

function summarizeTimedSamples(samples: TimedSample[]): NumericSummary {
  return summarizeNumbers(samples.map((sample) => sample.value));
}

function summarizeNumbers(values: number[]): NumericSummary {
  if (values.length === 0) {
    return {
      last: null,
      average: null,
      max: null,
    };
  }

  const last = values[values.length - 1] ?? null;
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    last,
    average: total / values.length,
    max: Math.max(...values),
  };
}

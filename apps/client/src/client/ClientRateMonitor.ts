import type { PerformanceRateState } from "@client/client/clientTypes.ts";

const RATE_SAMPLE_WINDOW_MS = 1000;
const MIN_RATE_SAMPLE_WINDOW_MS = 250;

export class ClientRateMonitor {
  private frameSamples: number[] = [];
  private tickSamples: Array<{ tick: number; timeMs: number }> = [];

  public recordFrameSample(timestamp: number): void {
    this.frameSamples.push(timestamp);
    this.trimFrameSamples(timestamp);
  }

  public recordTickSample(tick: number, timeMs: number): void {
    this.tickSamples.push({ tick, timeMs });
    this.trimTickSamples(timeMs);
  }

  public getMeasuredRates(now: number): PerformanceRateState {
    this.trimFrameSamples(now);
    this.trimTickSamples(now);

    return {
      frameRate: this.calculateFrameRate(now),
      tickRate: this.calculateTickRate(now),
    };
  }

  public reset(): void {
    this.frameSamples = [];
    this.tickSamples = [];
  }

  private trimFrameSamples(now: number): void {
    while (
      this.frameSamples.length > 1 &&
      now - (this.frameSamples[0] ?? now) > RATE_SAMPLE_WINDOW_MS
    ) {
      this.frameSamples.shift();
    }
  }

  private trimTickSamples(now: number): void {
    while (
      this.tickSamples.length > 1 &&
      now - (this.tickSamples[0]?.timeMs ?? now) > RATE_SAMPLE_WINDOW_MS
    ) {
      this.tickSamples.shift();
    }
  }

  private calculateFrameRate(now: number): number | null {
    if (this.frameSamples.length >= 2) {
      const firstSample = this.frameSamples[0] ?? now;
      const lastSample = this.frameSamples[this.frameSamples.length - 1] ?? now;
      const elapsedMs = lastSample - firstSample;
      if (elapsedMs <= 0) {
        return null;
      }

      return ((this.frameSamples.length - 1) * 1000) / elapsedMs;
    }

    if (this.frameSamples.length === 1) {
      return now - (this.frameSamples[0] ?? now) >= MIN_RATE_SAMPLE_WINDOW_MS
        ? 0
        : null;
    }

    return null;
  }

  private calculateTickRate(now: number): number | null {
    if (this.tickSamples.length >= 2) {
      const firstSample = this.tickSamples[0];
      const lastSample = this.tickSamples[this.tickSamples.length - 1];
      if (!firstSample || !lastSample) {
        return null;
      }

      const elapsedMs = lastSample.timeMs - firstSample.timeMs;
      if (elapsedMs <= 0) {
        return null;
      }

      return ((lastSample.tick - firstSample.tick) * 1000) / elapsedMs;
    }

    if (this.tickSamples.length === 1) {
      return now - (this.tickSamples[0]?.timeMs ?? now) >=
        MIN_RATE_SAMPLE_WINDOW_MS
        ? 0
        : null;
    }

    return null;
  }
}

import { ClientFrameLoop } from "@client/client/ClientFrameLoop.ts";
import { ClientRateMonitor } from "@client/client/ClientRateMonitor.ts";
import type { PerformanceRateState } from "@client/client/clientTypes.ts";

type FrameControllerOptions = {
  isStarted: () => boolean;
  onFrame: (timestampMs: number, deltaMs: number) => void;
  onAfterFrame: (timestampMs: number) => void;
};

export class ClientFrameController {
  private readonly frameLoop = new ClientFrameLoop();
  private readonly rateMonitor = new ClientRateMonitor();

  public start(options: FrameControllerOptions): void {
    if (this.frameLoop.isRunning()) {
      return;
    }

    this.frameLoop.start((timestampMs, deltaMs) => {
      if (!options.isStarted()) {
        this.stop();
        return;
      }

      this.rateMonitor.recordFrameSample(timestampMs);
      options.onFrame(timestampMs, deltaMs);
      options.onAfterFrame(timestampMs);
    });
  }

  public stop(): void {
    this.frameLoop.stop();
  }

  public isRunning(): boolean {
    return this.frameLoop.isRunning();
  }

  public reset(): void {
    this.rateMonitor.reset();
  }

  public recordTickSample(tick: number, nowMs: number): void {
    this.rateMonitor.recordTickSample(tick, nowMs);
  }

  public getMeasuredRates(nowMs: number): PerformanceRateState {
    return this.rateMonitor.getMeasuredRates(nowMs);
  }
}

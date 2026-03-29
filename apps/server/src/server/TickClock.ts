/**
 * Fixed-rate timer wrapper used by the authoritative server tick loop.
 * Keeps timer concerns out of GameServer.
 */
export class TickClock {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private accumulatorMs = 0;
  private lastFrameAtMs = 0;
  private overloadCounter = 0;

  /**
   * Creates a timer that targets the configured tick rate.
   * @param tickRate Desired simulation ticks per second.
   */
  constructor(tickRate: number) {
    this.intervalMs = 1000 / tickRate;
  }

  /**
   * Starts periodic callbacks at the configured fixed interval.
   * @param cb Tick callback invoked on each interval.
   */
  public start(cb: () => void): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.accumulatorMs = 0;
    this.lastFrameAtMs = performance.now();

    const pump = (): void => {
      if (!this.running) {
        return;
      }

      const now = performance.now();
      this.accumulatorMs += now - this.lastFrameAtMs;
      this.lastFrameAtMs = now;

      let steps = 0;
      while (this.accumulatorMs >= this.intervalMs && steps < 3) {
        cb();
        this.accumulatorMs -= this.intervalMs;
        steps += 1;
      }

      if (this.accumulatorMs >= this.intervalMs) {
        this.accumulatorMs %= this.intervalMs;
        this.overloadCounter += 1;
        if (this.overloadCounter % 30 === 0) {
          console.warn("tick_clock_overloaded");
        }
      }

      this.timer = setTimeout(
        pump,
        Math.max(1, Math.floor(this.intervalMs / 2)),
      );
    };

    this.timer = setTimeout(pump, this.intervalMs);
  }

  /**
   * Stops the periodic callback loop if it is running.
   */
  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

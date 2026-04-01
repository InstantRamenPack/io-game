/**
 * Fixed-rate timer wrapper used by the authoritative server tick loop.
 * Keeps timer concerns out of GameServer.
 */
export class TickClock {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private nextTickAtMs = 0;
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
    this.overloadCounter = 0;
    this.nextTickAtMs = performance.now() + this.intervalMs;

    const pump = (): void => {
      if (!this.running) {
        return;
      }

      let now = performance.now();
      let steps = 0;
      while (now >= this.nextTickAtMs && steps < 3) {
        cb();
        this.nextTickAtMs += this.intervalMs;
        steps += 1;
        now = performance.now();
      }

      if (now >= this.nextTickAtMs) {
        const skippedTicks =
          Math.floor((now - this.nextTickAtMs) / this.intervalMs) + 1;
        this.nextTickAtMs += skippedTicks * this.intervalMs;
        this.overloadCounter += 1;
        if (this.overloadCounter % 30 === 0) {
          console.warn("tick_clock_overloaded");
        }
      }

      const delayMs = Math.max(1, Math.round(this.nextTickAtMs - now));
      this.timer = setTimeout(pump, delayMs);
    };

    this.timer = setTimeout(pump, Math.max(1, Math.round(this.intervalMs)));
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

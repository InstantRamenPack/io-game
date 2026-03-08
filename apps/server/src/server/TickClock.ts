/**
 * Fixed-rate timer wrapper used by the authoritative server tick loop.
 * Keeps timer concerns out of GameServer.
 */
export class TickClock {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  /**
   * Creates a timer that targets the configured tick rate.
   * @param tickRate Desired simulation ticks per second.
   */
  constructor(tickRate: number) {
    this.intervalMs = 1000 / tickRate;
  }

  /**
   * Starts periodic callbacks with a computed frame delta in milliseconds.
   * @param cb Tick callback invoked on each interval.
   */
  start(cb: (deltaMs: number) => void): void {
    if (this.running) {
      return;
    }

    this.running = true;
    let last = this.nowMs();

    this.timer = setInterval(() => {
      const now = this.nowMs();
      const deltaMs = now - last;
      last = now;
      cb(deltaMs);
    }, this.intervalMs);
  }

  /**
   * Stops the periodic callback loop if it is running.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Returns a monotonic timestamp in milliseconds.
   * @returns Monotonic timestamp suitable for delta calculations.
   */
  nowMs(): number {
    return performance.now();
  }
}

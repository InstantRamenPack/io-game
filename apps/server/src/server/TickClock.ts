/** Fixed-rate timer wrapper used by the server tick loop. */
export class TickClock {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  /** Creates a timer that targets the configured tick rate. */
  constructor(tickRate: number) {
    this.intervalMs = 1000 / tickRate;
  }

  /** Starts periodic callbacks with computed frame delta in milliseconds. */
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

  /** Stops the periodic callback loop if active. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Returns a monotonic timestamp in milliseconds. */
  nowMs(): number {
    return performance.now();
  }
}

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
   * Starts periodic callbacks at the configured fixed interval.
   * @param cb Tick callback invoked on each interval.
   */
  start(cb: () => void): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer = setInterval(cb, this.intervalMs);
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
}

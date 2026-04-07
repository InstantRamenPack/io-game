type FrameHandler = (timestampMs: number, deltaMs: number) => void;

export class ClientFrameLoop {
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;

  public start(frameHandler: FrameHandler): void {
    if (this.animationFrameId !== undefined) {
      return;
    }

    const tick = (timestampMs: number): void => {
      if (this.animationFrameId === undefined) {
        return;
      }

      const deltaMs =
        this.lastAnimationFrameTime === undefined
          ? 0
          : timestampMs - this.lastAnimationFrameTime;
      this.lastAnimationFrameTime = timestampMs;
      frameHandler(timestampMs, deltaMs);
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.lastAnimationFrameTime = undefined;
    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  public stop(): void {
    if (this.animationFrameId !== undefined) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    this.lastAnimationFrameTime = undefined;
  }

  public isRunning(): boolean {
    return this.animationFrameId !== undefined;
  }
}

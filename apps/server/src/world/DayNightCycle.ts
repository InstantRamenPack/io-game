import type { DayNightSnapshot } from "@shared/net/snapshots.ts";

export type DayNightPhase = "day" | "night";

type DayNightCycleConfig = {
  dayDurationMs: number;
  nightDurationMs: number;
  startPhase?: DayNightPhase;
};

/**
 * Fixed-duration day/night cycle controller.
 * Day runs first, then night, repeating forever.
 */
export class DayNightCycle {
  private readonly dayDurationMs: number;
  private readonly nightDurationMs: number;
  private phase: DayNightPhase;
  private phaseElapsedMs = 0;
  private dayCount = 0;

  public constructor(config: DayNightCycleConfig) {
    this.dayDurationMs = Math.max(1, Math.floor(config.dayDurationMs));
    this.nightDurationMs = Math.max(1, Math.floor(config.nightDurationMs));
    this.phase = config.startPhase ?? "day";
    if (this.phase === "day") {
      this.onDayStart();
    } else {
      this.onNightStart();
    }
  }

  public tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    this.phaseElapsedMs += deltaMs;
    let phaseDuration = this.getPhaseDurationMs();

    while (this.phaseElapsedMs >= phaseDuration) {
      this.phaseElapsedMs -= phaseDuration;
      if (this.phase === "night") {
        this.phase = "day";
        this.dayCount += 1;
        this.onDayStart();
      } else {
        this.phase = "night";
        this.onNightStart();
      }
      phaseDuration = this.getPhaseDurationMs();
    }
  }

  public isNight(): boolean {
    return this.phase === "night";
  }

  public toSnapshot(): DayNightSnapshot {
    return {
      dayCount: this.dayCount,
      phase: this.phase,
      phaseElapsedMs: Math.floor(this.phaseElapsedMs),
      dayDurationMs: this.dayDurationMs,
      nightDurationMs: this.nightDurationMs,
    };
  }

  protected onDayStart(): void {
    // Placeholder hook for day-start behavior.
  }

  protected onNightStart(): void {
    // Placeholder hook for night-start behavior.
  }

  private getPhaseDurationMs(): number {
    return this.phase === "day" ? this.dayDurationMs : this.nightDurationMs;
  }
}

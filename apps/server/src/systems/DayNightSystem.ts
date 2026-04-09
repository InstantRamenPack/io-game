import type { DayNightSnapshot } from "@shared/net/snapshots.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

export type DayNightPhase = "day" | "night";

type DayNightSystemConfig = {
  tickRate: number;
  dayDurationMs: number;
  nightDurationMs: number;
  startPhase?: DayNightPhase;
};

/**
 * Tick-driven day/night cycle system.
 * Durations are quantized to the authoritative server tick clock.
 */
export class DayNightSystem implements System {
  private readonly tickRate: number;
  private readonly dayDurationTicks: number;
  private readonly nightDurationTicks: number;
  private phase: DayNightPhase;
  private phaseElapsedTicks = 0;
  private dayCount = 0;

  constructor(config: DayNightSystemConfig) {
    this.tickRate = Math.max(1, Math.floor(config.tickRate));
    this.dayDurationTicks = this.durationMsToTicks(config.dayDurationMs);
    this.nightDurationTicks = this.durationMsToTicks(config.nightDurationMs);
    this.phase = config.startPhase ?? "day";
  }

  public update(_world: World, _deltaMs: number): void {
    this.phaseElapsedTicks += 1;
    let phaseDurationTicks = this.getPhaseDurationTicks();

    while (this.phaseElapsedTicks >= phaseDurationTicks) {
      this.phaseElapsedTicks -= phaseDurationTicks;
      if (this.phase === "night") {
        this.phase = "day";
        this.dayCount += 1;
      } else {
        this.phase = "night";
      }
      phaseDurationTicks = this.getPhaseDurationTicks();
    }
  }

  public isNight(): boolean {
    return this.phase === "night";
  }

  public toSnapshot(): DayNightSnapshot {
    return {
      dayCount: this.dayCount,
      phase: this.phase,
      phaseElapsedMs: this.ticksToMs(this.phaseElapsedTicks),
      dayDurationMs: this.ticksToMs(this.dayDurationTicks),
      nightDurationMs: this.ticksToMs(this.nightDurationTicks),
    };
  }

  private durationMsToTicks(durationMs: number): number {
    const normalizedDurationMs = Math.max(1, Math.floor(durationMs));
    return Math.max(
      1,
      Math.round((normalizedDurationMs * this.tickRate) / 1000),
    );
  }

  private ticksToMs(ticks: number): number {
    return Math.round((ticks * 1000) / this.tickRate);
  }

  private getPhaseDurationTicks(): number {
    return this.phase === "day"
      ? this.dayDurationTicks
      : this.nightDurationTicks;
  }
}

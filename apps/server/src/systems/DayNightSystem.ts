import type { DayNightPhase, DayNightSnapshot } from "@shared/net/snapshots.ts";
import { scaleAuthoredSimulationTicks } from "@shared/config/simulationTicks.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

type DayNightSystemConfig = {
  tickRate: number;
  dayDurationTicks: number;
  nightDurationTicks: number;
  startPhase?: DayNightPhase;
};

/**
 * Tick-driven day/night cycle system.
 */
export class DayNightSystem implements System {
  private readonly dayDurationTicks: number;
  private readonly nightDurationTicks: number;
  private phase: DayNightPhase;
  private phaseElapsedTicks = 0;
  private dayCount = 0;

  constructor(config: DayNightSystemConfig) {
    this.dayDurationTicks = scaleAuthoredSimulationTicks(
      config.dayDurationTicks,
      config.tickRate,
    );
    this.nightDurationTicks = scaleAuthoredSimulationTicks(
      config.nightDurationTicks,
      config.tickRate,
    );
    this.phase = config.startPhase ?? "day";
  }

  public update(world: World): void {
    this.phaseElapsedTicks += world.gameConfig.simulationSpeedMultiplier;
    let phaseDurationTicks = this.getPhaseDurationTicks();

    while (this.phaseElapsedTicks >= phaseDurationTicks) {
      if (this.phase === "night" && !world.canEndNight()) {
        this.phaseElapsedTicks = phaseDurationTicks - 1;
        break;
      }

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

  public setPhase(phase: DayNightPhase): void {
    this.phase = phase;
    this.phaseElapsedTicks = 0;
    if (phase === "day") {
      this.dayCount += 1;
    }
  }

  public toSnapshot(
    waveEnemiesRemaining = 0,
    waveSpawnsPending = 0,
    waveThreatTotal = 0,
  ): DayNightSnapshot {
    return {
      dayCount: this.dayCount,
      phase: this.phase,
      phaseElapsedTicks: this.phaseElapsedTicks,
      dayDurationTicks: this.dayDurationTicks,
      nightDurationTicks: this.nightDurationTicks,
      waveEnemiesRemaining,
      waveSpawnsPending,
      waveThreatTotal,
    };
  }

  private getPhaseDurationTicks(): number {
    return this.phase === "day"
      ? this.dayDurationTicks
      : this.nightDurationTicks;
  }
}

import type { World } from "@server/world/World.ts";
import { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import type { DayNightPhase } from "@server/systems/DayNightSystem.ts";
import type { WaveSpawner } from "@server/systems/WaveSpawner.ts";

type DayNightWithWavesConfig = {
  tickRate: number;
  dayDurationMs: number;
  nightDurationMs: number;
  startPhase?: DayNightPhase;
  waveSpawner?: WaveSpawner;
};

/**
 * Extended day/night system that integrates wave spawning mechanics.
 * Automatically triggers wave spawns at the start of each night cycle.
 */
export class DayNightSystemWithWaves extends DayNightSystem {
  private waveSpawner: WaveSpawner | null;
  private lastIsNight = false;
  private nightCyleCounter = 0;

  constructor(config: DayNightWithWavesConfig) {
    super({
      tickRate: config.tickRate,
      dayDurationMs: config.dayDurationMs,
      nightDurationMs: config.nightDurationMs,
      startPhase: config.startPhase,
    });
    this.waveSpawner = config.waveSpawner ?? null;
    // Track initial night cycle if starting at night
    if (config.startPhase === "night") {
      this.nightCyleCounter = 1;
    }
  }

  /**
   * Sets the wave spawner for this day/night system.
   * Can be called after construction to inject the spawner.
   */
  public setWaveSpawner(spawner: WaveSpawner): void {
    this.waveSpawner = spawner;
  }

  /**
   * Updates the day/night cycle and wave spawner.
   */
  public override update(world: World, deltaMs: number): void {
    const wasNight = this.lastIsNight;
    super.update(world, deltaMs);
    const isNight = this.isNight();

    // Detect transition to night (day -> night)
    if (!wasNight && isNight) {
      this.nightCyleCounter += 1;
      if (this.waveSpawner) {
        this.waveSpawner.onNightStart(this.nightCyleCounter);
      }
    }

    this.lastIsNight = isNight;

    // Update wave spawner each tick
    if (this.waveSpawner) {
      this.waveSpawner.update(world, isNight);
    }
  }

  /**
   * Returns the current night cycle number (1-indexed).
   */
  public getNightCycleCount(): number {
    return this.nightCyleCounter;
  }
}

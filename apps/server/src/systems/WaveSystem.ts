import type { World } from "@server/world/World.ts";
import type { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import type { System } from "@server/systems/System.ts";
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";

type WaveSystemConfig = {
  dayNightSystem: DayNightSystem;
  waveSpawner?: WaveSpawner;
};

/**
 * Tick-driven wave spawns driven by the day/night phase.
 */
export class WaveSystem implements System {
  private readonly dayNightSystem: DayNightSystem;
  private readonly waveSpawner: WaveSpawner | null;
  private lastIsNight: boolean;
  private nightCycleCounter = 0;

  constructor(config: WaveSystemConfig) {
    this.dayNightSystem = config.dayNightSystem;
    this.waveSpawner = config.waveSpawner ?? null;
    this.lastIsNight = this.dayNightSystem.isNight();

    if (this.lastIsNight) {
      this.nightCycleCounter = 1;
      this.waveSpawner?.onNightStart(this.nightCycleCounter);
    }
  }

  public getNightCycleCounter(): number {
    return this.nightCycleCounter;
  }

  public update(world: World, _deltaMs: number): void {
    if (!this.waveSpawner) {
      return;
    }

    const isNight = this.dayNightSystem.isNight();
    if (!this.lastIsNight && isNight) {
      this.nightCycleCounter += 1;
      this.waveSpawner.onNightStart(this.nightCycleCounter);
    }

    this.lastIsNight = isNight;
    this.waveSpawner.update(world, isNight);
  }

  public static loadFromSharedConfig(config: {
    dayNightSystem: DayNightSystem;
    chatService?: {
      broadcastSystemMessage?: (text: string) => void;
    };
  }): WaveSystem {
    return new WaveSystem({
      dayNightSystem: config.dayNightSystem,
      waveSpawner: WaveSpawner.fromSharedConfig(config.chatService ?? null),
    });
  }
}

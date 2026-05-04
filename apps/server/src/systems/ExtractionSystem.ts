import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import type { WaveSystem } from "@server/systems/WaveSystem.ts";
import { Player } from "@server/entities/Player.ts";
import type { ExtractionSnapshot, ExtractionStage } from "@shared/net/snapshots.ts";

export const HELIPAD_X = 1000;
export const HELIPAD_Y = 4050;
export const HELIPAD_RADIUS = 130;

const ENEMY_DANGER_RADIUS = 400;
const BOARD_TIMER_GOAL_MS = 45_000;
const CHOPPER_TIMER_GOAL_MS = 20_000;
const FINAL_WAVE_CYCLE = 3;

export class ExtractionSystem implements System {
  private readonly waveSystem: WaveSystem;
  private stage: ExtractionStage = "locked";
  private boardElapsedMs = 0;
  private chopperElapsedMs = 0;
  private completed = false;

  private cachedPlayersOnPad = 0;
  private cachedTotalAlivePlayers = 0;
  private cachedEnemiesInRadius = 0;

  constructor(waveSystem: WaveSystem) {
    this.waveSystem = waveSystem;
  }

  public isComplete(): boolean {
    return this.completed;
  }

  public update(world: World, deltaMs: number): void {
    if (this.completed) {
      return;
    }

    const finalWaveActive =
      this.waveSystem.getNightCycleCounter() >= FINAL_WAVE_CYCLE;

    let totalAlivePlayers = 0;
    let playersOnPad = 0;
    for (const entity of world.entities.all()) {
      if (!(entity instanceof Player) || !entity.alive) {
        continue;
      }
      totalAlivePlayers += 1;
      const dx = entity.x - HELIPAD_X;
      const dy = entity.y - HELIPAD_Y;
      if (Math.sqrt(dx * dx + dy * dy) <= HELIPAD_RADIUS) {
        playersOnPad += 1;
      }
    }

    let enemiesInRadius = 0;
    world.ensureSpatialIndex();
    for (const entity of world.spatial.queryBox(
      HELIPAD_X - ENEMY_DANGER_RADIUS,
      HELIPAD_Y - ENEMY_DANGER_RADIUS,
      HELIPAD_X + ENEMY_DANGER_RADIUS,
      HELIPAD_Y + ENEMY_DANGER_RADIUS,
    )) {
      if (!entity.typeId.startsWith("enemy:") || !entity.alive) {
        continue;
      }
      const dx = entity.x - HELIPAD_X;
      const dy = entity.y - HELIPAD_Y;
      if (Math.sqrt(dx * dx + dy * dy) <= ENEMY_DANGER_RADIUS) {
        enemiesInRadius += 1;
      }
    }

    this.cachedPlayersOnPad = playersOnPad;
    this.cachedTotalAlivePlayers = totalAlivePlayers;
    this.cachedEnemiesInRadius = enemiesInRadius;

    if (!finalWaveActive) {
      this.stage = "locked";
      return;
    }

    const allOnPad =
      totalAlivePlayers > 0 && playersOnPad >= totalAlivePlayers;

    switch (this.stage) {
      case "locked":
        this.stage = "active";
        break;

      case "active":
        if (allOnPad) {
          this.stage = "board_timer";
        }
        break;

      case "board_timer":
        if (allOnPad) {
          this.boardElapsedMs = Math.min(
            this.boardElapsedMs + deltaMs,
            BOARD_TIMER_GOAL_MS,
          );
          if (this.boardElapsedMs >= BOARD_TIMER_GOAL_MS) {
            this.stage = "chopper_incoming";
            this.chopperElapsedMs = 0;
          }
        }
        break;

      case "chopper_incoming":
        if (enemiesInRadius > 0) {
          this.chopperElapsedMs = 0;
        } else {
          this.chopperElapsedMs = Math.min(
            this.chopperElapsedMs + deltaMs,
            CHOPPER_TIMER_GOAL_MS,
          );
          if (this.chopperElapsedMs >= CHOPPER_TIMER_GOAL_MS) {
            this.stage = "complete";
            this.completed = true;
          }
        }
        break;

      case "complete":
        break;
    }
  }

  public toSnapshot(): ExtractionSnapshot {
    return {
      stage: this.stage,
      boardElapsedMs: Math.round(this.boardElapsedMs),
      chopperElapsedMs: Math.round(this.chopperElapsedMs),
      playersOnPad: this.cachedPlayersOnPad,
      totalAlivePlayers: this.cachedTotalAlivePlayers,
      enemiesInRadius: this.cachedEnemiesInRadius,
    };
  }
}

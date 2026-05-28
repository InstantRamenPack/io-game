import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import { Player } from "@server/entities/Player.ts";
import type {
  ExtractionLockedReason,
  ExtractionSnapshot,
  ExtractionStage,
} from "@shared/net/snapshots.ts";
import { extractionConfig } from "@shared/config/gameplayConfig.ts";

export const HELIPAD_X = extractionConfig.fallbackHelipad.x;
export const HELIPAD_Y = extractionConfig.fallbackHelipad.y;
export const HELIPAD_RADIUS = extractionConfig.fallbackHelipad.radius;

export class ExtractionSystem implements System {
  private stage: ExtractionStage = "active";
  private lockedReason: ExtractionLockedReason | undefined;
  private boardElapsedMs = 0;
  private chopperElapsedMs = 0;
  private completed = false;

  private cachedPlayersOnPad = 0;
  private cachedTotalAlivePlayers = 0;
  private cachedEnemiesInRadius = 0;

  constructor(_waveSystem?: unknown) {}

  public isComplete(): boolean {
    return this.completed;
  }

  public update(world: World, deltaMs: number): void {
    if (this.completed) {
      return;
    }
    const helipad = world.proceduralLayout?.extraction ?? {
      x: HELIPAD_X,
      y: HELIPAD_Y,
      radius: HELIPAD_RADIUS,
    };

    let totalAlivePlayers = 0;
    let playersOnPad = 0;
    for (const entity of world.entities.all()) {
      if (!(entity instanceof Player) || !entity.alive) {
        continue;
      }
      totalAlivePlayers += 1;
      const dx = entity.x - helipad.x;
      const dy = entity.y - helipad.y;
      if (Math.sqrt(dx * dx + dy * dy) <= helipad.radius) {
        playersOnPad += 1;
      }
    }

    let enemiesInRadius = 0;
    world.ensureSpatialIndex();
    for (const entity of world.spatial.queryBox(
      helipad.x - extractionConfig.enemyDangerRadius,
      helipad.y - extractionConfig.enemyDangerRadius,
      helipad.x + extractionConfig.enemyDangerRadius,
      helipad.y + extractionConfig.enemyDangerRadius,
    )) {
      if (!entity.typeId.startsWith("enemy:") || !entity.alive) {
        continue;
      }
      const dx = entity.x - helipad.x;
      const dy = entity.y - helipad.y;
      if (Math.sqrt(dx * dx + dy * dy) <= extractionConfig.enemyDangerRadius) {
        enemiesInRadius += 1;
      }
    }

    this.cachedPlayersOnPad = playersOnPad;
    this.cachedTotalAlivePlayers = totalAlivePlayers;
    this.cachedEnemiesInRadius = enemiesInRadius;

    if (
      world.infrastructureSystem &&
      !world.infrastructureSystem.isCommsActive()
    ) {
      this.stage = "locked";
      this.lockedReason = "comms_offline";
      this.boardElapsedMs = 0;
      this.chopperElapsedMs = 0;
      return;
    }

    this.lockedReason = undefined;
    const allOnPad = totalAlivePlayers > 0 && playersOnPad >= totalAlivePlayers;

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
            extractionConfig.boardTimerGoalMs,
          );
          if (this.boardElapsedMs >= extractionConfig.boardTimerGoalMs) {
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
            extractionConfig.chopperTimerGoalMs,
          );
          if (this.chopperElapsedMs >= extractionConfig.chopperTimerGoalMs) {
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
      lockedReason: this.lockedReason,
      boardElapsedMs: Math.round(this.boardElapsedMs),
      chopperElapsedMs: Math.round(this.chopperElapsedMs),
      playersOnPad: this.cachedPlayersOnPad,
      totalAlivePlayers: this.cachedTotalAlivePlayers,
      enemiesInRadius: this.cachedEnemiesInRadius,
    };
  }
}

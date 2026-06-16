import type { System } from "@server/systems/System.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";
import { Player } from "@server/entities/Player.ts";
import type {
  ExtractionLockedReason,
  ExtractionSnapshot,
  ExtractionStage,
} from "@shared/net/snapshots.ts";
import { extractionConfig } from "@shared/config/gameplayConfig.ts";
import { scaleAuthoredSimulationTicks } from "@shared/config/simulationTicks.ts";

export const HELIPAD_X = extractionConfig.fallbackHelipad.x;
export const HELIPAD_Y = extractionConfig.fallbackHelipad.y;
export const HELIPAD_RADIUS = extractionConfig.fallbackHelipad.radius;

export class ExtractionSystem implements System {
  private stage: ExtractionStage = "active";
  private lockedReason: ExtractionLockedReason | undefined;
  private boardElapsedTicks = 0;
  private chopperElapsedTicks = 0;
  private boardTimerGoalTicks = 0;
  private completed = false;

  private cachedPlayersOnPad = 0;
  private cachedTotalAlivePlayers = 0;
  private cachedEnemiesInRadius = 0;
  private readonly enemyQueryBuffer: Entity[] = [];

  constructor(_waveSystem?: unknown) {}

  public isComplete(): boolean {
    return this.completed;
  }

  public update(world: World): void {
    if (this.completed) {
      return;
    }
    this.boardTimerGoalTicks = scaleAuthoredSimulationTicks(
      extractionConfig.boardTimerGoalTicks,
      world.gameConfig.tickRate,
    );
    const simStep = world.gameConfig.simulationSpeedMultiplier;

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
      this.enemyQueryBuffer,
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
      this.boardElapsedTicks = 0;
      this.chopperElapsedTicks = 0;
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
          this.boardElapsedTicks = 0;
        }
        break;

      case "board_timer":
        if (!allOnPad) {
          this.stage = "active";
          this.boardElapsedTicks = 0;
          break;
        }
        this.boardElapsedTicks = Math.min(
          this.boardElapsedTicks + simStep,
          this.boardTimerGoalTicks,
        );
        if (this.boardElapsedTicks >= this.boardTimerGoalTicks) {
          this.stage = "complete";
          this.completed = true;
        }
        break;

      case "chopper_incoming":
        this.stage = "complete";
        this.completed = true;
        break;

      case "complete":
        break;
    }
  }

  public toSnapshot(): ExtractionSnapshot {
    return {
      stage: this.stage,
      lockedReason: this.lockedReason,
      boardElapsedTicks: Math.round(this.boardElapsedTicks),
      boardTimerGoalTicks: this.boardTimerGoalTicks,
      chopperElapsedTicks: Math.round(this.chopperElapsedTicks),
      playersOnPad: this.cachedPlayersOnPad,
      totalAlivePlayers: this.cachedTotalAlivePlayers,
      enemiesInRadius: this.cachedEnemiesInRadius,
    };
  }
}

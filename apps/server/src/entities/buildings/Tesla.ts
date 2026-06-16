import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import {
  TESLA_SHOCK_DAMAGE,
  TESLA_SHOCK_RADIUS,
  TESLA_STUN_TICKS,
  TESLA_WAVE_SPEED_PX_PER_TICK,
} from "@shared/gameplay/teslaShock.ts";
import type { NetEvent } from "@shared/net/events.ts";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

export class Tesla extends Building {
  public static override readonly resourceName = "tesla";
  private readonly shockedEnemyIds = new Set<number>();
  private readonly waveHitEnemyIds = new Set<number>();
  private readonly waveTriggerDistanceByEnemyId = new Map<number, number>();
  private readonly touchingEnemyIds = new Set<number>();
  private readonly enemyQueryBuffer: Entity[] = [];
  private waveStartTick: number | null = null;

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }

  public override getCombatInstigator(world: World): Entity | null {
    if (this.ownerId === undefined) {
      return null;
    }

    const owner = world.get(this.ownerId);
    return owner instanceof Player && owner.alive ? owner : null;
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive) {
      return;
    }

    const touchingEnemyIds = this.collectTouchingEnemyIds(world);
    const hasNewContact = [...touchingEnemyIds].some(
      (enemyId) => !this.shockedEnemyIds.has(enemyId),
    );

    if (this.waveStartTick === null && hasNewContact) {
      this.beginShockWave(world, touchingEnemyIds);
    }

    if (this.waveStartTick !== null) {
      this.advanceShockWave(world, touchingEnemyIds);
    } else {
      this.releaseEnemiesNoLongerTouching(touchingEnemyIds);
    }
  }

  private collectTouchingEnemyIds(world: World): Set<number> {
    const touchingEnemyIds = this.touchingEnemyIds;
    touchingEnemyIds.clear();
    for (const candidate of world.spatial.queryBox(
      this.x - TESLA_SHOCK_RADIUS,
      this.y - TESLA_SHOCK_RADIUS,
      this.x + TESLA_SHOCK_RADIUS,
      this.y + TESLA_SHOCK_RADIUS,
      this.enemyQueryBuffer,
    )) {
      if (candidate.getCombatTeam() !== "enemy" || !candidate.alive) {
        continue;
      }

      const distanceSquared = getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        this.x,
        this.y,
      );
      if (distanceSquared > TESLA_SHOCK_RADIUS * TESLA_SHOCK_RADIUS) {
        continue;
      }

      touchingEnemyIds.add(candidate.id);
    }
    return touchingEnemyIds;
  }

  private beginShockWave(world: World, touchingEnemyIds: Set<number>): void {
    this.waveStartTick = world.tick;
    this.waveHitEnemyIds.clear();
    this.waveTriggerDistanceByEnemyId.clear();
    for (const enemyId of touchingEnemyIds) {
      const enemy = world.get(enemyId);
      if (!enemy || enemy.getCombatTeam() !== "enemy" || !enemy.alive) {
        continue;
      }
      this.waveTriggerDistanceByEnemyId.set(
        enemyId,
        this.getEnemyShockDistance(enemy),
      );
    }

    const shockEvent: NetEvent = {
      type: "tesla_shock",
      payload: {
        sourceId: this.id,
        x: this.x,
        y: this.y,
        radius: TESLA_SHOCK_RADIUS,
      },
    };
    world.events.push(shockEvent);
  }

  private advanceShockWave(world: World, touchingEnemyIds: Set<number>): void {
    if (this.waveStartTick === null) {
      return;
    }

    const elapsedTicks = world.tick - this.waveStartTick;
    const waveRadius = Math.min(
      TESLA_SHOCK_RADIUS,
      elapsedTicks * TESLA_WAVE_SPEED_PX_PER_TICK,
    );

    for (const [enemyId, triggerDistance] of this
      .waveTriggerDistanceByEnemyId) {
      if (this.waveHitEnemyIds.has(enemyId)) {
        continue;
      }
      if (waveRadius < triggerDistance) {
        continue;
      }

      const candidate = world.get(enemyId);
      if (
        !candidate ||
        candidate.getCombatTeam() !== "enemy" ||
        !candidate.alive
      ) {
        continue;
      }

      new DamageEffect(TESLA_SHOCK_DAMAGE).apply(world, this, candidate);
      this.applyStunnedEffect(world, candidate);
      this.waveHitEnemyIds.add(enemyId);
    }

    if (waveRadius >= TESLA_SHOCK_RADIUS) {
      this.finishShockWave(touchingEnemyIds);
    }
  }

  private getEnemyShockDistance(enemy: Entity): number {
    return Math.sqrt(
      getDistanceSquaredToResolvedRectSet(
        enemy.getWorldHitboxes(),
        this.x,
        this.y,
      ),
    );
  }

  private finishShockWave(touchingEnemyIds: Set<number>): void {
    this.waveStartTick = null;
    this.waveHitEnemyIds.clear();
    this.waveTriggerDistanceByEnemyId.clear();
    this.shockedEnemyIds.clear();
    for (const enemyId of touchingEnemyIds) {
      this.shockedEnemyIds.add(enemyId);
    }
  }

  private releaseEnemiesNoLongerTouching(touchingEnemyIds: Set<number>): void {
    for (const enemyId of this.shockedEnemyIds) {
      if (!touchingEnemyIds.has(enemyId)) {
        this.shockedEnemyIds.delete(enemyId);
      }
    }
  }

  private applyStunnedEffect(world: World, target: Entity): void {
    new StunnedEffect(TESLA_STUN_TICKS).apply(world, this, target);
  }
}

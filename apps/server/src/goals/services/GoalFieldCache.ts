import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import {
  COMBAT_OCCLUSION_EPSILON,
  getBlockerRayEntryDistance,
  getEntityRayEntryDistance,
} from "@server/combat/CombatOcclusion.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import type { World } from "@server/world/World.ts";

type TargetEntityCtor = abstract new (...args: never[]) => Entity;
type TargetEntityFilter = (entity: Entity) => boolean;
type TargetCandidateCache = { tick: number; targetIds: number[] };
type CachedWaypoint = { x: number; y: number } | null;

const FIELD_CELL_SIZE = 64;
const INSTANCE_SCAN_TARGET_LIMIT = 64;
const CELL_QUERY_PADDING = FIELD_CELL_SIZE * Math.SQRT2;

/**
 * Tick-scoped shared AI lookups for enemies sampling the same local field.
 */
export class GoalFieldCache {
  private tick = -1;
  private readonly ctorIdByCtor = new Map<TargetEntityCtor, number>();
  private nextCtorId = 1;
  private readonly targetCandidatesByKey = new Map<
    string,
    TargetCandidateCache
  >();
  private readonly lineOfSightByKey = new Map<string, boolean>();
  private readonly waypointsByKey = new Map<string, CachedWaypoint>();
  private readonly queryBuffer: Entity[] = [];
  private readonly blockerQueryBuffer: StaticGeometryBlocker[] = [];
  private alivePlayerPositions: Array<{ x: number; y: number }> | undefined;
  private alivePlayerPositionsTick = -1;

  public beginTick(tick: number): void {
    if (this.tick === tick) {
      return;
    }
    this.tick = tick;
    this.targetCandidatesByKey.clear();
    this.lineOfSightByKey.clear();
    this.waypointsByKey.clear();
    this.alivePlayerPositions = undefined;
    this.alivePlayerPositionsTick = -1;
  }

  public isEntityNearAnyPlayer(
    world: World,
    x: number,
    y: number,
    range: number,
  ): boolean {
    if (range <= 0) {
      return true;
    }
    const rangeSquared = range * range;
    for (const player of this.getAlivePlayerPositions(world)) {
      const deltaX = player.x - x;
      const deltaY = player.y - y;
      if (deltaX * deltaX + deltaY * deltaY <= rangeSquared) {
        return true;
      }
    }
    return false;
  }

  public getCachedWaypoint<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
    goalX: number,
    goalY: number,
    lookup: () => CachedWaypoint,
  ): CachedWaypoint {
    const goalTile = ctx.world.navPathService.toTileCoordinate(goalX, goalY);
    const cell = this.getCell(ctx.self.x, ctx.self.y);
    const cacheKey = `${this.tick}:${goalTile.x}:${goalTile.y}:${cell.x}:${cell.y}`;
    if (this.waypointsByKey.has(cacheKey)) {
      return this.waypointsByKey.get(cacheKey) ?? null;
    }
    const waypoint = lookup();
    this.waypointsByKey.set(cacheKey, waypoint);
    return waypoint;
  }

  public findNearestTargetInRange<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
    targetCtor: TargetEntityCtor,
    aggroRange: number,
    aggroRangeSquared: number,
    filter: TargetEntityFilter | undefined,
    requireLineOfSight: boolean,
  ): Entity | null {
    const candidates = this.resolveTargetCandidates(
      ctx,
      targetCtor,
      aggroRange,
      filter,
    );
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const targetId of candidates) {
      const target = ctx.world.get(targetId);
      if (
        !(target instanceof targetCtor) ||
        !target.alive ||
        (filter && !filter(target))
      ) {
        continue;
      }

      const distanceSquared = distanceSquaredBetween(ctx.self, target);
      if (
        distanceSquared > aggroRangeSquared ||
        distanceSquared >= bestDistanceSquared ||
        !this.canSeeTarget(ctx, target, requireLineOfSight)
      ) {
        continue;
      }

      bestTarget = target;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
  }

  public canSeeTarget<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
    target: Entity,
    requireLineOfSight: boolean,
  ): boolean {
    if (!requireLineOfSight) {
      return true;
    }

    const cell = this.getCell(ctx.self.x, ctx.self.y);
    const cacheKey = `${this.tick}:${cell.x}:${cell.y}:${target.id}`;
    const cached = this.lineOfSightByKey.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const visible = this.computeLineOfSight(
      {
        id: ctx.self.id,
        x: cell.x * FIELD_CELL_SIZE + FIELD_CELL_SIZE / 2,
        y: cell.y * FIELD_CELL_SIZE + FIELD_CELL_SIZE / 2,
      },
      target,
      ctx,
    );
    this.lineOfSightByKey.set(cacheKey, visible);
    return visible;
  }

  private resolveTargetCandidates<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
    targetCtor: TargetEntityCtor,
    aggroRange: number,
    filter: TargetEntityFilter | undefined,
  ): readonly number[] {
    const cell = this.getCell(ctx.self.x, ctx.self.y);
    const key = `${this.tick}:${this.getCtorId(targetCtor)}:${aggroRange}:${filter ? "filtered" : "plain"}:${cell.x}:${cell.y}`;
    const cached = this.targetCandidatesByKey.get(key);
    if (cached?.tick === this.tick) {
      return cached.targetIds;
    }

    const centerX = cell.x * FIELD_CELL_SIZE + FIELD_CELL_SIZE / 2;
    const centerY = cell.y * FIELD_CELL_SIZE + FIELD_CELL_SIZE / 2;
    const targetIds: number[] = [];
    const instanceTargets = ctx.world.entities.queryInstances(targetCtor);
    const source =
      instanceTargets.length <= INSTANCE_SCAN_TARGET_LIMIT ||
      !Number.isFinite(aggroRange)
        ? instanceTargets
        : ctx.world.spatial.queryBox(
            centerX - aggroRange - CELL_QUERY_PADDING,
            centerY - aggroRange - CELL_QUERY_PADDING,
            centerX + aggroRange + CELL_QUERY_PADDING,
            centerY + aggroRange + CELL_QUERY_PADDING,
            this.queryBuffer,
          );

    for (const target of source) {
      if (
        !(target instanceof targetCtor) ||
        !target.alive ||
        (filter && !filter(target))
      ) {
        continue;
      }
      targetIds.push(target.id);
    }
    targetIds.sort((leftId, rightId) => {
      const left = ctx.world.get(leftId);
      const right = ctx.world.get(rightId);
      if (!left || !right) {
        return leftId - rightId;
      }
      return (
        distanceSquaredToPoint(centerX, centerY, left) -
        distanceSquaredToPoint(centerX, centerY, right)
      );
    });

    this.targetCandidatesByKey.set(key, { tick: this.tick, targetIds });
    return targetIds;
  }

  private computeLineOfSight<TSelf extends GoalActor>(
    source: { id: number; x: number; y: number },
    target: Entity,
    ctx: GoalContext<TSelf>,
  ): boolean {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= COMBAT_OCCLUSION_EPSILON) {
      return true;
    }

    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    const targetEntryDistance = getEntityRayEntryDistance(
      target,
      source.x,
      source.y,
      directionX,
      directionY,
    );
    const maxVisibleDistance = targetEntryDistance ?? distance;
    const minX = Math.min(source.x, target.x);
    const minY = Math.min(source.y, target.y);
    const maxX = Math.max(source.x, target.x);
    const maxY = Math.max(source.y, target.y);

    for (const blocker of ctx.world.staticGeometry.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.blockerQueryBuffer,
      false,
    )) {
      if (blocker.entityId === source.id || blocker.entityId === target.id) {
        continue;
      }
      const blockerEntryDistance = getBlockerRayEntryDistance(
        blocker,
        source.x,
        source.y,
        directionX,
        directionY,
      );
      if (
        blockerEntryDistance !== null &&
        blockerEntryDistance < maxVisibleDistance - COMBAT_OCCLUSION_EPSILON
      ) {
        return false;
      }
    }

    return true;
  }

  private getCtorId(targetCtor: TargetEntityCtor): number {
    const cached = this.ctorIdByCtor.get(targetCtor);
    if (cached !== undefined) {
      return cached;
    }
    const id = this.nextCtorId;
    this.nextCtorId += 1;
    this.ctorIdByCtor.set(targetCtor, id);
    return id;
  }

  private getCell(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / FIELD_CELL_SIZE),
      y: Math.floor(y / FIELD_CELL_SIZE),
    };
  }

  private getAlivePlayerPositions(
    world: World,
  ): readonly { x: number; y: number }[] {
    if (this.alivePlayerPositionsTick !== this.tick) {
      this.alivePlayerPositions = world.entities
        .queryInstances(Player)
        .filter((player) => player.alive)
        .map((player) => ({ x: player.x, y: player.y }));
      this.alivePlayerPositionsTick = this.tick;
    }
    return this.alivePlayerPositions ?? [];
  }
}

function distanceSquaredBetween(left: GoalActor, right: Entity): number {
  return distanceSquaredToPoint(left.x, left.y, right);
}

function distanceSquaredToPoint(x: number, y: number, target: Entity): number {
  const deltaX = target.x - x;
  const deltaY = target.y - y;
  return deltaX * deltaX + deltaY * deltaY;
}

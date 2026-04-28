import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import {
  getResolvedRectSetSeparation,
  getSweptResolvedRectSetIntersectionTime,
} from "@shared/geometry/collision.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import { lerpAngle } from "@shared/math/angle.ts";

export type HeldMovementState = Record<
  "up" | "down" | "left" | "right",
  boolean
>;

type LocalPlayerTruthState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
};

type SentPoseSample = {
  seq: number;
  clientTimeMs: number;
};

const PLAYER_DRIVE_ACCELERATION_MULTIPLIER = 0.45;
const PLAYER_DRIVE_ACCELERATION_MIN = 4;
const LOCAL_COLLISION_PASSES = 3;

export class LocalPlayerPredictionController {
  private localPlayerTruth?: LocalPlayerTruthState;
  private lastProcessedSeq = -1;
  private readonly sentPoseHistory: SentPoseSample[] = [];
  private serverVelocityHint: { vx: number; vy: number; receivedAtMs: number } =
    {
      vx: 0,
      vy: 0,
      receivedAtMs: Number.NEGATIVE_INFINITY,
    };

  public reset(): void {
    this.localPlayerTruth = undefined;
    this.lastProcessedSeq = -1;
    this.sentPoseHistory.length = 0;
    this.serverVelocityHint = {
      vx: 0,
      vy: 0,
      receivedAtMs: Number.NEGATIVE_INFINITY,
    };
  }

  public recordSentPose(seq: number, clientTimeMs: number): void {
    if (!Number.isFinite(seq) || seq <= this.lastProcessedSeq) {
      return;
    }
    this.sentPoseHistory.push({
      seq: Math.floor(seq),
      clientTimeMs,
    });
    if (this.sentPoseHistory.length > 256) {
      this.sentPoseHistory.splice(0, this.sentPoseHistory.length - 256);
    }
  }

  public reconcileToAuthoritativeSnapshot(options: {
    player: ClientEntity | undefined;
    lastProcessedSeq: number | undefined;
  }): void {
    const { player, lastProcessedSeq } = options;
    if (!player?.alive) {
      this.localPlayerTruth = undefined;
      this.sentPoseHistory.length = 0;
      return;
    }

    if (this.localPlayerTruth === undefined) {
      this.localPlayerTruth = {
        x: player.serverX,
        y: player.serverY,
        vx: player.vx,
        vy: player.vy,
        rotation: player.rotation,
      };
    }

    if (lastProcessedSeq !== undefined) {
      this.acknowledgeProcessedSeq(lastProcessedSeq);
    }

    this.serverVelocityHint = {
      vx: player.vx,
      vy: player.vy,
      receivedAtMs: performance.now(),
    };
  }

  public update(options: {
    deltaMs: number;
    tickRate: number;
    player: ClientEntity | undefined;
    world: ClientWorld | undefined;
    heldMovement: HeldMovementState;
    aimTheta: number | null;
    worldSize: { w: number; h: number };
  }): EntityPresentationState | null {
    const {
      deltaMs,
      tickRate,
      player,
      world,
      heldMovement,
      aimTheta,
      worldSize,
    } = options;
    if (!player?.alive) {
      this.localPlayerTruth = undefined;
      return null;
    }

    const tickMs = 1000 / Math.max(1, tickRate);
    const frameTicks = Math.max(0, deltaMs) / tickMs;
    if (frameTicks <= 0) {
      return this.getVisualPose(player);
    }

    const current = this.localPlayerTruth ?? {
      x: player.serverX,
      y: player.serverY,
      vx: player.vx,
      vy: player.vy,
      rotation: player.rotation,
    };

    const moveSpeed = player.moveSpeed ?? 0;
    const movementBlocked = isLocalMovementBlocked(player);
    const desiredVelocity = movementBlocked
      ? { x: 0, y: 0 }
      : computeLocalDesiredVelocity(
          moveSpeed * resolveLocalMovementSpeedMultiplier(player),
          heldMovement,
        );
    const driveAccelerationPerTick = Math.max(
      PLAYER_DRIVE_ACCELERATION_MIN,
      moveSpeed * PLAYER_DRIVE_ACCELERATION_MULTIPLIER,
    );
    const simulatedVelocity = advanceVelocityToward(
      current.vx,
      current.vy,
      desiredVelocity.x,
      desiredVelocity.y,
      driveAccelerationPerTick * frameTicks,
    );

    let nextVx = simulatedVelocity.x;
    let nextVy = simulatedVelocity.y;
    if (performance.now() - this.serverVelocityHint.receivedAtMs <= 250) {
      const hasInput =
        heldMovement.up ||
        heldMovement.down ||
        heldMovement.left ||
        heldMovement.right;
      const blend = hasInput ? 0.06 : 0.2;
      nextVx = lerp(nextVx, this.serverVelocityHint.vx, blend);
      nextVy = lerp(nextVy, this.serverVelocityHint.vy, blend);
    }

    const nextState: LocalPlayerTruthState = {
      x: current.x + nextVx * frameTicks,
      y: current.y + nextVy * frameTicks,
      vx: nextVx,
      vy: nextVy,
      rotation: aimTheta ?? lerpAngle(current.rotation, player.rotation, 0.25),
    };

    clampToWorldBounds(nextState, player, worldSize);
    if (world) {
      clampLocalSweptStaticCollisions(nextState, current, player, world);
      resolveLocalCollisions(nextState, player, world);
    }

    this.localPlayerTruth = nextState;
    return nextState;
  }

  public getPoseForSend(player: ClientEntity | undefined): {
    x: number;
    y: number;
    rotation: number;
  } | null {
    return this.getVisualPose(player);
  }

  public getVisualPose(player: ClientEntity | undefined): {
    x: number;
    y: number;
    rotation: number;
  } | null {
    if (this.localPlayerTruth) {
      return this.localPlayerTruth;
    }

    if (!player) {
      return null;
    }

    return {
      x: player.serverX,
      y: player.serverY,
      rotation: player.rotation,
    };
  }

  private acknowledgeProcessedSeq(lastProcessedSeq: number): void {
    if (
      !Number.isFinite(lastProcessedSeq) ||
      lastProcessedSeq <= this.lastProcessedSeq
    ) {
      return;
    }
    this.lastProcessedSeq = Math.floor(lastProcessedSeq);
    while (this.sentPoseHistory.length > 0) {
      const first = this.sentPoseHistory[0];
      if (!first || first.seq > this.lastProcessedSeq) {
        break;
      }
      this.sentPoseHistory.shift();
    }
  }
}

function computeLocalDesiredVelocity(
  moveSpeed: number,
  heldMovement: HeldMovementState,
): {
  x: number;
  y: number;
} {
  let moveX = 0;
  let moveY = 0;
  if (heldMovement.left) {
    moveX -= 1;
  }
  if (heldMovement.right) {
    moveX += 1;
  }
  if (heldMovement.up) {
    moveY -= 1;
  }
  if (heldMovement.down) {
    moveY += 1;
  }

  const magnitude = Math.hypot(moveX, moveY);
  if (magnitude <= Number.EPSILON) {
    return { x: 0, y: 0 };
  }

  return {
    x: (moveX / magnitude) * moveSpeed,
    y: (moveY / magnitude) * moveSpeed,
  };
}

function advanceVelocityToward(
  currentVx: number,
  currentVy: number,
  targetVx: number,
  targetVy: number,
  maxDelta: number,
): { x: number; y: number } {
  if (!Number.isFinite(maxDelta) || maxDelta <= 0) {
    return { x: currentVx, y: currentVy };
  }

  const deltaX = targetVx - currentVx;
  const deltaY = targetVy - currentVy;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= Number.EPSILON || distance <= maxDelta) {
    return { x: targetVx, y: targetVy };
  }

  return {
    x: currentVx + (deltaX / distance) * maxDelta,
    y: currentVy + (deltaY / distance) * maxDelta,
  };
}

function resolveLocalCollisions(
  state: LocalPlayerTruthState,
  player: ClientEntity,
  world: ClientWorld,
): void {
  let selfHitboxes = resolveHitboxRects(state.x, state.y, player.hitboxes);

  for (let pass = 0; pass < LOCAL_COLLISION_PASSES; pass += 1) {
    let changed = false;

    for (const candidate of world.entities.values()) {
      if (
        candidate.id === player.id ||
        !candidate.alive ||
        candidate.kind === "projectile" ||
        candidate.kind === "pickup"
      ) {
        continue;
      }

      const candidateHitboxes = resolveHitboxRects(
        candidate.x,
        candidate.y,
        candidate.hitboxes,
      );
      const separation = getResolvedRectSetSeparation(
        selfHitboxes,
        candidateHitboxes,
      );
      if (!separation) {
        continue;
      }

      const isDynamicCandidate =
        candidate.kind === "player" || candidate.kind === "enemy";
      const correction = isDynamicCandidate
        ? separation.translation * 0.5
        : separation.translation;
      if (separation.axis === "x") {
        state.x += correction;
        if (state.vx * correction < 0) {
          state.vx = 0;
        }
      } else {
        state.y += correction;
        if (state.vy * correction < 0) {
          state.vy = 0;
        }
      }

      selfHitboxes = resolveHitboxRects(state.x, state.y, player.hitboxes);
      changed = true;
    }

    if (!changed) {
      return;
    }
  }
}

function clampLocalSweptStaticCollisions(
  state: LocalPlayerTruthState,
  previous: LocalPlayerTruthState,
  player: ClientEntity,
  world: ClientWorld,
): void {
  const clampedX = resolveLocalSweptAxisDelta(
    player,
    world,
    previous.x,
    previous.y,
    state.x - previous.x,
    0,
  );
  const nextX = previous.x + clampedX;
  const clampedY = resolveLocalSweptAxisDelta(
    player,
    world,
    nextX,
    previous.y,
    0,
    state.y - previous.y,
  );
  let nextY = previous.y + clampedY;
  const diagonalClamped = resolveLocalDiagonalCornerClamp(
    player,
    world,
    previous.x,
    previous.y,
    nextX,
    nextY,
  );
  state.x = diagonalClamped.x;
  state.y = diagonalClamped.y;
  if (clampedX !== state.x - previous.x) {
    state.vx = 0;
  }
  if (clampedY !== nextY - previous.y || diagonalClamped.y !== nextY) {
    state.vy = 0;
  }
}

function resolveLocalSweptAxisDelta(
  player: ClientEntity,
  world: ClientWorld,
  fromX: number,
  fromY: number,
  deltaX: number,
  deltaY: number,
): number {
  if (deltaX === 0 && deltaY === 0) {
    return 0;
  }

  const candidates = getLocalStaticCollisionCandidates(
    player,
    world,
    fromX,
    fromY,
    fromX + deltaX,
    fromY + deltaY,
  );
  if (candidates.length === 0) {
    return deltaX !== 0 ? deltaX : deltaY;
  }

  const movingHitboxes = resolveHitboxRects(fromX, fromY, player.hitboxes);
  let earliestHitTime: number | null = null;
  for (const candidate of candidates) {
    const hitTime = getSweptResolvedRectSetIntersectionTime(
      movingHitboxes,
      deltaX,
      deltaY,
      resolveHitboxRects(candidate.x, candidate.y, candidate.hitboxes),
    );
    if (hitTime === null) {
      continue;
    }
    if (earliestHitTime === null || hitTime < earliestHitTime) {
      earliestHitTime = hitTime;
    }
  }
  if (earliestHitTime === null) {
    return deltaX !== 0 ? deltaX : deltaY;
  }

  const safeTime = Math.max(0, Math.min(1, earliestHitTime - 0.001));
  return (deltaX !== 0 ? deltaX : deltaY) * safeTime;
}

function resolveLocalDiagonalCornerClamp(
  player: ClientEntity,
  world: ClientWorld,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const deltaX = targetX - fromX;
  const deltaY = targetY - fromY;
  if (deltaX === 0 || deltaY === 0) {
    return { x: targetX, y: targetY };
  }

  const candidates = getLocalStaticCollisionCandidates(
    player,
    world,
    fromX,
    fromY,
    targetX,
    targetY,
  );
  if (candidates.length === 0) {
    return { x: targetX, y: targetY };
  }

  const movingHitboxes = resolveHitboxRects(fromX, fromY, player.hitboxes);
  let earliestHitTime: number | null = null;
  for (const candidate of candidates) {
    const hitTime = getSweptResolvedRectSetIntersectionTime(
      movingHitboxes,
      deltaX,
      deltaY,
      resolveHitboxRects(candidate.x, candidate.y, candidate.hitboxes),
    );
    if (hitTime === null) {
      continue;
    }
    if (earliestHitTime === null || hitTime < earliestHitTime) {
      earliestHitTime = hitTime;
    }
  }
  if (earliestHitTime === null || earliestHitTime >= 1) {
    return { x: targetX, y: targetY };
  }

  const safeTime = Math.max(0, Math.min(1, earliestHitTime - 0.001));
  return {
    x: fromX + deltaX * safeTime,
    y: fromY + deltaY * safeTime,
  };
}

function getLocalStaticCollisionCandidates(
  player: ClientEntity,
  world: ClientWorld,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): ClientEntity[] {
  const bounds = player.hitboxBounds;
  const minX = Math.min(fromX + bounds.minX, targetX + bounds.minX);
  const minY = Math.min(fromY + bounds.minY, targetY + bounds.minY);
  const maxX = Math.max(fromX + bounds.maxX, targetX + bounds.maxX);
  const maxY = Math.max(fromY + bounds.maxY, targetY + bounds.maxY);
  const candidates: ClientEntity[] = [];
  for (const candidate of world.entities.values()) {
    if (
      candidate.id === player.id ||
      !candidate.alive ||
      candidate.kind === "player" ||
      candidate.kind === "enemy" ||
      candidate.kind === "projectile" ||
      candidate.kind === "pickup"
    ) {
      continue;
    }
    const candidateBounds = candidate.hitboxBounds;
    if (
      candidate.x + candidateBounds.maxX <= minX ||
      candidate.x + candidateBounds.minX >= maxX ||
      candidate.y + candidateBounds.maxY <= minY ||
      candidate.y + candidateBounds.minY >= maxY
    ) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

function clampToWorldBounds(
  state: LocalPlayerTruthState,
  player: ClientEntity,
  worldSize: { w: number; h: number },
): void {
  const bounds = player.hitboxBounds;
  const minX = -bounds.minX;
  const maxX = Math.max(minX, worldSize.w - bounds.maxX);
  const minY = -bounds.minY;
  const maxY = Math.max(minY, worldSize.h - bounds.maxY);
  if (state.x < minX) {
    state.x = minX;
    state.vx = 0;
  } else if (state.x > maxX) {
    state.x = maxX;
    state.vx = 0;
  }
  if (state.y < minY) {
    state.y = minY;
    state.vy = 0;
  } else if (state.y > maxY) {
    state.y = maxY;
    state.vy = 0;
  }
}

function isLocalMovementBlocked(player: ClientEntity): boolean {
  return (
    player.activeEffects?.some((effect) => effect.preventsAction === true) ??
    false
  );
}

function resolveLocalMovementSpeedMultiplier(player: ClientEntity): number {
  let multiplier = 1;
  for (const effect of player.activeEffects ?? []) {
    if (effect.speedMultiplier !== undefined) {
      multiplier *= effect.speedMultiplier;
    }
  }
  return multiplier;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

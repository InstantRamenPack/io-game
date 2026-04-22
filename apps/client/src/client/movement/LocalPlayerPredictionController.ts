import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
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

const LOCAL_PLAYER_RECONCILE_SNAP_DISTANCE = 96;
const LOCAL_PLAYER_RECONCILE_FOLLOW_SHARPNESS = 14;
const PLAYER_DRIVE_ACCELERATION_MULTIPLIER = 0.45;
const PLAYER_DRIVE_ACCELERATION_MIN = 4;
const CONFUSION_SPEED_MULTIPLIER = 0.4;

export class LocalPlayerPredictionController {
  private localPlayerTruth?: LocalPlayerTruthState;

  public reset(): void {
    this.localPlayerTruth = undefined;
  }

  public update(options: {
    deltaMs: number;
    tickRate: number;
    player: ClientEntity | undefined;
    heldMovement: HeldMovementState;
    aimTheta: number | null;
  }): EntityPresentationState | null {
    const { deltaMs, tickRate, player, heldMovement, aimTheta } = options;
    if (!player?.alive) {
      this.localPlayerTruth = undefined;
      return null;
    }

    const dt = Math.max(0, deltaMs) / 1000;
    const authoritativeX = player.serverX;
    const authoritativeY = player.serverY;
    const current = this.localPlayerTruth ?? {
      x: authoritativeX,
      y: authoritativeY,
      vx: player.vx,
      vy: player.vy,
      rotation: player.rotation,
    };
    const simulated = simulateLocalPlayerTruth(
      current,
      player,
      deltaMs,
      tickRate,
      heldMovement,
    );
    let nextX = simulated.x;
    let nextY = simulated.y;
    let nextVx = simulated.vx;
    let nextVy = simulated.vy;
    const errorDistance = Math.hypot(
      authoritativeX - nextX,
      authoritativeY - nextY,
    );
    if (errorDistance > LOCAL_PLAYER_RECONCILE_SNAP_DISTANCE) {
      nextX = authoritativeX;
      nextY = authoritativeY;
      nextVx = player.vx;
      nextVy = player.vy;
    } else {
      const followT =
        1 - Math.exp(-LOCAL_PLAYER_RECONCILE_FOLLOW_SHARPNESS * dt);
      nextX = lerp(nextX, authoritativeX, followT);
      nextY = lerp(nextY, authoritativeY, followT);
      nextVx = lerp(nextVx, player.vx, followT);
      nextVy = lerp(nextVy, player.vy, followT);
    }

    const nextRotation =
      aimTheta ?? lerpAngle(current.rotation, player.rotation, 0.35);
    this.localPlayerTruth = {
      x: nextX,
      y: nextY,
      vx: nextVx,
      vy: nextVy,
      rotation: nextRotation,
    };

    return this.localPlayerTruth;
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
}

function simulateLocalPlayerTruth(
  current: LocalPlayerTruthState,
  player: ClientEntity,
  deltaMs: number,
  tickRate: number,
  heldMovement: HeldMovementState,
): LocalPlayerTruthState {
  const tickMs = 1000 / Math.max(1, tickRate);
  const frameTicks = Math.max(0, deltaMs) / tickMs;
  if (frameTicks <= 0) {
    return current;
  }

  const moveSpeed = player.moveSpeed ?? 0;
  const movementBlocked = isLocalMovementBlocked(player);
  const moveVelocity = movementBlocked
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
    moveVelocity.x,
    moveVelocity.y,
    driveAccelerationPerTick * frameTicks,
  );

  return {
    ...current,
    x: current.x + simulatedVelocity.x * frameTicks,
    y: current.y + simulatedVelocity.y * frameTicks,
    vx: simulatedVelocity.x,
    vy: simulatedVelocity.y,
  };
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

function isLocalMovementBlocked(player: ClientEntity): boolean {
  return (
    player.activeEffects?.some(
      (effect) => effect.typeId === "effect:stunned",
    ) ?? false
  );
}

function resolveLocalMovementSpeedMultiplier(player: ClientEntity): number {
  let multiplier = 1;
  for (const effect of player.activeEffects ?? []) {
    if (effect.typeId === "effect:confusion") {
      multiplier *= CONFUSION_SPEED_MULTIPLIER;
    }
  }
  return multiplier;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
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

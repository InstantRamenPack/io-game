import type { HitboxBounds, HitboxRect } from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Weapon } from "@server/items/Weapon.ts";

export type GoalVelocityComponents = {
  desiredVx: number;
  desiredVy: number;
  driveVx: number;
  driveVy: number;
  momentumVx: number;
  momentumVy: number;
};

export type GoalCollisionMode = "none" | "dynamic" | "static";

export interface GoalActor {
  id: number;
  typeId: ResourceId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  alive: boolean;
  collisionMode: GoalCollisionMode;
  moveSpeed: number;
  speed?: number;
  targetId?: number;
  weapons: Weapon[];
  setDesiredVelocity(velocityX: number, velocityY: number): void;
  steerTowardVelocity(
    velocityX: number,
    velocityY: number,
    maxDelta: number,
  ): void;
  applyImpulse(impulseX: number, impulseY: number): void;
  resetMovement(): void;
  getDebugVelocityComponents(): GoalVelocityComponents;
  getHitboxBounds(): HitboxBounds;
  setHitboxProfile(profileName: string): void;
  setHitboxProfileRects(
    profileName: string,
    rects: readonly HitboxRect[],
  ): void;
}

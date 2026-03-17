import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";
import { Inventory } from "@server/items/Inventory.ts";

export type CollisionMode = "none" | "dynamic" | "static";

/**
 * Base authoritative entity class for world simulation.
 * All server-side runtime entities inherit transform and snapshot behavior from here.
 */
export abstract class Entity {
  id: number;
  readonly typeId: ResourceId;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  rotation = 0;
  /** Half-size of the square hitbox; radius 12 means a 24x24 box. */
  radius = 12;
  collisionMode: CollisionMode = "none";
  alive = true;
  protected moveVx = 0;
  protected moveVy = 0;
  protected impulseVx = 0;
  protected impulseVy = 0;
  hp?: number;
  maxHp?: number;
  teamId?: number;
  ownerId?: number;
  inventory?: Inventory;

  /**
   * Initializes common identity fields for entity subclasses.
   * @param id Stable runtime entity id.
   * @param typeId Shared entity type id.
   * @param inventory Optional inventory attached to the entity at construction time.
   */
  protected constructor(id: number, typeId: ResourceId, inventory?: Inventory) {
    this.id = id;
    this.typeId = typeId;
    if (inventory) {
      this.inventory = inventory;
    }
  }

  /**
   * Per-tick extension point for subclass-specific behavior.
   * @param _world World being simulated.
   */
  tick(_world: World): void {
    this.impulseVx *= 0.85;
    this.impulseVy *= 0.85;
    if (Math.abs(this.impulseVx) < 1) {
      this.impulseVx = 0;
    }
    if (Math.abs(this.impulseVy) < 1) {
      this.impulseVy = 0;
    }
    this.syncVelocity();
  }

  /**
   * Converts runtime entity state into the replicated snapshot shape.
   * @returns Serialized snapshot record for this entity.
   */
  toSnapshot(): EntitySnapshot {
    const snap: EntitySnapshot = {
      id: this.id,
      typeId: this.typeId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      rotation: this.rotation,
      radius: this.radius,
      ownerId: this.ownerId,
    };

    if (this.hp !== undefined) {
      snap.hp = this.hp;
    }
    if (this.maxHp !== undefined) {
      snap.maxHp = this.maxHp;
    }

    // include inventory if present (Player used to do this itself)
    if (this.inventory) {
      snap.inventory = this.inventory.toSnapshot();
      snap.activeSlot = this.inventory.activeIndex;
    }

    return snap;
  }

  /**
   * Applies an instantaneous velocity impulse. Used for knockback effects.
   * @param impulseX X-axis impulse.
   * @param impulseY Y-axis impulse.
   */
  applyImpulse(impulseX: number, impulseY: number): void {
    this.impulseVx += impulseX;
    this.impulseVy += impulseY;
    this.syncVelocity();
  }

  /**
   * Sets the movement-controlled velocity component before impulses are applied.
   * @param velocityX Movement X velocity.
   * @param velocityY Movement Y velocity.
   */
  setMovementVelocity(velocityX: number, velocityY: number): void {
    this.moveVx = velocityX;
    this.moveVy = velocityY;
    this.syncVelocity();
  }

  /**
   * Clears both movement and impulse velocity components.
   */
  resetVelocity(): void {
    this.moveVx = 0;
    this.moveVy = 0;
    this.impulseVx = 0;
    this.impulseVy = 0;
    this.syncVelocity();
  }

  private syncVelocity(): void {
    this.vx = this.moveVx + this.impulseVx;
    this.vy = this.moveVy + this.impulseVy;
  }

  /**
   * Returns whether a world point falls inside the entity's square hitbox.
   * @param pointX World-space X coordinate.
   * @param pointY World-space Y coordinate.
   * @returns True when the point is inside the current hitbox bounds.
   */
  containsPoint(pointX: number, pointY: number): boolean {
    return (
      pointX >= this.x - this.radius &&
      pointX <= this.x + this.radius &&
      pointY >= this.y - this.radius &&
      pointY <= this.y + this.radius
    );
  }
}

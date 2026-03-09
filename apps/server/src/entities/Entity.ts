import type { EntityKind } from "@shared/ids/EntityKinds.ts";
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
  kind: EntityKind;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  rotation = 0;
  /** Half-size of the square hitbox; radius 12 means a 24x24 box. */
  radius = 12;
  collisionMode: CollisionMode = "none";
  alive = true;
  hp?: number;
  maxHp?: number;
  teamId?: number;
  ownerId?: number;
  data: Record<string, unknown> = {};
  /** Optional fixed-slot inventory; many entity types may not use it. */
  inventory?: Inventory;

  /**
   * Initializes common identity fields for entity subclasses.
   * @param id Stable runtime entity id.
   * @param kind Shared entity kind tag.
   * @param inventory Optional inventory attached to the entity at construction time.
   */
  protected constructor(id: number, kind: EntityKind, inventory?: Inventory) {
    this.id = id;
    this.kind = kind;
    if (inventory) {
      this.inventory = inventory;
    }
  }

  /**
   * Per-tick extension point for subclass-specific behavior.
   * @param _world World being simulated.
   * @param _deltaMs Tick delta in milliseconds.
   */
  tick(_world: World, _deltaMs: number): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /**
   * Converts runtime entity state into the replicated snapshot shape.
   * @returns Serialized snapshot record for this entity.
   */
  toSnapshot(): EntitySnapshot {
    const snap: EntitySnapshot = {
      id: this.id,
      kind: this.kind,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      rotation: this.rotation,
      radius: this.radius,
      ownerId: this.ownerId,
      data: this.data,
    };

    if (this.hp !== undefined) {
      snap.hp = this.hp;
    }
    if (this.maxHp !== undefined) {
      snap.maxHp = this.maxHp;
    }

    // include inventory if present (Player used to do this itself)
    if (this.inventory) {
      snap.data = snap.data || {};
      snap.data.inventory = this.inventory.toSnapshot();
      snap.data.activeSlot = this.inventory.activeIndex;
    }

    return snap;
  }

  /**
   * Applies an instantaneous velocity impulse. Used for knockback effects.
   * @param impulseX X-axis impulse.
   * @param impulseY Y-axis impulse.
   */
  applyImpulse(impulseX: number, impulseY: number): void {
    this.vx += impulseX;
    this.vy += impulseY;
  }
}

import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/** Base authoritative entity class for world simulation. */
export abstract class Entity {
  id: number;
  kind: EntityKind;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  rotation = 0;
  radius = 12;
  alive = true;
  teamId?: number;
  ownerId?: number;
  data: Record<string, unknown> = {};

  /** Initializes common identity fields for entity subclasses. */
  constructor(id: number, kind: EntityKind) {
    this.id = id;
    this.kind = kind;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  tick(_world: World, _deltaMs: number): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /** Converts runtime entity state into network snapshot shape. */
  toSnapshot(): EntitySnapshot {
    return {
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
  }

  /** Applies an instantaneous velocity impulse. */
  applyImpulse(impulseX: number, impulseY: number): void {
    this.vx += impulseX;
    this.vy += impulseY;
  }
}

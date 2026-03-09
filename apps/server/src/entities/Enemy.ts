import { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

/**
 * Static hostile entity used as the first server-authoritative enemy body.
 * This class deliberately has no AI yet; it only contributes collision and hp state.
 */
export class Enemy extends Entity {
  /**
   * Creates a stationary enemy with collision and hp enabled.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, "enemy");
    this.collisionMode = "static";
    this.radius = 16;
    this.hp = 100;
    this.maxHp = 100;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Static enemies do not have AI behavior in this pass.
   * @param _world World being simulated.
   * @param _deltaMs Tick delta in milliseconds.
   */
  override tick(_world: World, _deltaMs: number): void {
    // empty for now
  }
}

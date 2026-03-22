import { Item } from "@server/items/Item.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";

/**
 * Abstract weapon item that can perform attacks.
 * Subclasses implement specific attack behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  public fireRate: number;
  public range: number;
  public hitEffects: Effect[];

  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;

  public constructor(
    id: number,
    fireRate: number,
    range: number,
    hitEffects: Effect[],
  ) {
    super(id);
    this.fireRate = fireRate;
    this.range = range;
    this.hitEffects = hitEffects;
  }

  /** Advances cooldown state by one fixed tick. */
  public override tick(_world: World): void {
    if (this.cooldownTicks > 0) {
      this.cooldownTicks -= 1;
    }
  }

  /** @returns True if weapon can hit now. */
  public canHit(): boolean {
    return this.cooldownTicks <= 0;
  }

  /**
   * Returns whether this weapon can currently hit the provided target.
   * Used by AI goals to select attacks by weapon slot.
   */
  public abstract canHitTarget(
    world: World,
    owner: Entity,
    target: Entity,
  ): boolean;

  /** Attempts an attack toward the given aim point. */
  public abstract hit(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): boolean;

  /** Resets cooldown after a successful hit attempt. */
  protected resetCooldown(tickRate: number): void {
    this.cooldownTicks = Math.max(1, Math.round(tickRate / this.fireRate));
  }
}

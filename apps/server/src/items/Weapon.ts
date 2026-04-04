import { Item } from "@server/items/Item.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { WeaponSnapshot } from "@shared/net/snapshots.ts";

/**
 * Abstract weapon item that can perform attacks.
 * Subclasses implement specific attack behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  public fireRate: number;

  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;

  protected constructor(fireRate: number) {
    super();
    this.fireRate = fireRate;
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

  public toSnapshot(): WeaponSnapshot {
    return {
      typeId: this.typeId,
      ownerId: this.ownerId,
      cooldownTicksRemaining: this.cooldownTicks,
    };
  }

  public getReserveMagCount(_owner: Entity | undefined): number | undefined {
    return undefined;
  }
}

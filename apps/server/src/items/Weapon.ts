import { Item } from "@server/items/Item.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Abstract weapon item that can be fired.
 * Subclasses implement specific firing behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  public fireRate: number;
  public range: number;
  public hitEffects: Effect[];

  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;

  public constructor(
    id: number,
    typeId: ResourceId,
    fireRate: number,
    range: number,
    hitEffects: Effect[],
  ) {
    super(id, typeId);
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

  /** @returns True if weapon can fire now. */
  public canFire(): boolean {
    return this.cooldownTicks <= 0;
  }

  /** Fires the weapon; resets cooldown. Subclasses implement specifics. */
  public abstract fire(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): void;

  /** Resets cooldown after firing. */
  protected resetCooldown(tickRate: number): void {
    this.cooldownTicks = Math.max(1, Math.round(tickRate / this.fireRate));
  }
}

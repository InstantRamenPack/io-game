import { Item } from "./Item.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ItemKind } from "@shared/ids/ItemKinds.ts";

/**
 * Abstract weapon item that can be fired.
 * Subclasses implement specific firing behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  damage: number;
  fireRate: number; // attacks per second
  range: number;
  hitEffects: string[]; // effect IDs to apply on hit

  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;

  constructor(
    id: number,
    kind: ItemKind,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: string[],
  ) {
    super(id, kind);
    this.damage = damage;
    this.fireRate = fireRate;
    this.range = range;
    this.hitEffects = hitEffects;
  }

  /** Advances cooldown state by one fixed tick. */
  override tick(_world: World): void {
    if (this.cooldownTicks > 0) {
      this.cooldownTicks -= 1;
    }
  }

  /** @returns True if weapon can fire now. */
  canFire(): boolean {
    return this.cooldownTicks <= 0;
  }

  /** Fires the weapon; resets cooldown. Subclasses implement specifics. */
  abstract fire(world: World, owner: Entity, aimX: number, aimY: number): void;

  /** Resets cooldown after firing. */
  protected resetCooldown(tickRate: number): void {
    this.cooldownTicks = Math.max(1, Math.round(tickRate / this.fireRate));
  }
}

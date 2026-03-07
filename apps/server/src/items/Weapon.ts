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

  /** Cooldown timer in ms until next fire. */
  protected cooldownMs: number = 0;

  constructor(
    id: number,
    kind: ItemKind,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: string[]
  ) {
    super(id, kind);
    this.damage = damage;
    this.fireRate = fireRate;
    this.range = range;
    this.hitEffects = hitEffects;
  }

  /** Advances cooldown timer. */
  override tick(_world: World, dtMs: number): void {
    if (this.cooldownMs > 0) {
      this.cooldownMs = Math.max(0, this.cooldownMs - dtMs);
    }
  }

  /** @returns True if weapon can fire now. */
  canFire(): boolean {
    return this.cooldownMs <= 0;
  }

  /** Fires the weapon; resets cooldown. Subclasses implement specifics. */
  abstract fire(world: World, owner: Entity, aimX: number, aimY: number): void;

  /** Resets cooldown after firing. */
  protected resetCooldown(): void {
    this.cooldownMs = 1000 / this.fireRate;
  }
}
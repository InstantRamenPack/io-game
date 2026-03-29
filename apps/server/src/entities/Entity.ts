import type { EntityKind } from "@shared/content/schema.ts";
import type {
  HitboxBounds,
  HitboxRect,
  ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { EntitySnapshotBase } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { deriveTypeIdFromStaticMetadata } from "@server/registry/typeMetadata.ts";
import {
  CompositeHitbox,
  type HitboxProfiles,
} from "@server/entities/CompositeHitbox.ts";

export type CollisionMode = "none" | "dynamic" | "static";

type EntityConfig = {
  maxHp?: number;
};

/**
 * Base authoritative entity class for world simulation.
 * All server-side runtime entities inherit transform and snapshot behavior from here.
 */
export abstract class Entity {
  public static readonly resourceName: string = "";

  public static get typeId(): ResourceId {
    return deriveTypeIdFromStaticMetadata(
      this as typeof Entity & {
        readonly kind: EntityKind;
        readonly resourceName: string;
      },
    );
  }

  public id: number;
  public readonly typeId: ResourceId;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  /** Aim/facing rotation used for visuals and attack direction only. */
  public rotation = 0;
  public collisionMode: CollisionMode = "none";
  public alive = true;
  protected moveVx = 0;
  protected moveVy = 0;
  protected impulseVx = 0;
  protected impulseVy = 0;
  public hp: number;
  public maxHp: number;
  public ownerId?: number;
  private readonly compositeHitbox = new CompositeHitbox();

  /**
   * Initializes common identity fields for entity subclasses.
   * @param id Stable runtime entity id.
   * @param config Entity configuration.
   */
  protected constructor(id: number, config: EntityConfig = {}) {
    this.id = id;
    this.typeId = (this.constructor as typeof Entity).typeId;
    this.maxHp = Math.max(0, config.maxHp ?? 0);
    this.hp = this.maxHp;
  }

  /**
   * Per-tick extension point for subclass-specific behavior.
   * @param _world World being simulated.
   */
  public tick(_world: World): void {
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
  public toSnapshot(): EntitySnapshotBase {
    return {
      id: this.id,
      kind: entityTypeRegistry.require(this.typeId).kind,
      typeId: this.typeId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      rotation: this.rotation,
      hitboxes: this.hitboxes.map((rect) => ({ ...rect })),
      hp: this.hp,
      maxHp: this.maxHp,
      ownerId: this.ownerId,
    };
  }

  public get hitboxes(): readonly HitboxRect[] {
    return this.compositeHitbox.getLocalHitboxes();
  }

  public getHitboxBounds(): HitboxBounds {
    return this.compositeHitbox.getLocalBounds();
  }

  public getWorldBounds(): HitboxBounds {
    return this.compositeHitbox.getWorldBounds(this.x, this.y);
  }

  public getWorldHitboxes(): ResolvedHitboxRect[] {
    return this.compositeHitbox.getWorldHitboxes(this.x, this.y);
  }

  public getHitboxDirectionalExtent(
    directionX: number,
    directionY: number,
  ): number {
    return this.compositeHitbox.getDirectionalExtent(directionX, directionY);
  }

  public setHitboxProfile(profileName: string): void {
    this.compositeHitbox.setActiveProfile(profileName);
  }

  public setHitboxProfileRects(
    profileName: string,
    rects: readonly HitboxRect[],
  ): void {
    this.compositeHitbox.setProfileRects(profileName, rects);
  }

  protected setHitboxProfiles(
    profiles: HitboxProfiles,
    activeProfileName = "default",
  ): void {
    this.compositeHitbox.replaceProfiles(profiles, activeProfileName);
  }

  /**
   * Applies an instantaneous per-tick movement impulse. Used for knockback effects.
   * @param impulseX X-axis impulse delta applied each tick until it decays.
   * @param impulseY Y-axis impulse delta applied each tick until it decays.
   */
  public applyImpulse(impulseX: number, impulseY: number): void {
    this.impulseVx += impulseX;
    this.impulseVy += impulseY;
    this.syncVelocity();
  }

  /**
   * Sets the movement-controlled per-tick delta before impulses are applied.
   * @param velocityX Movement X delta applied each simulation tick.
   * @param velocityY Movement Y delta applied each simulation tick.
   */
  public setMovementVelocity(velocityX: number, velocityY: number): void {
    this.moveVx = velocityX;
    this.moveVy = velocityY;
    this.syncVelocity();
  }

  /**
   * Clears both movement and impulse velocity components.
   */
  public resetVelocity(): void {
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
   * Resolves the combat instigator for attacks sourced from this entity.
   * Plain entities are their own instigator; proxy entities like projectiles can override.
   * @param _world World used to resolve related runtime state.
   * @returns Entity that should be credited for combat rules and events.
   */
  public getCombatInstigator(_world: World): Entity | null {
    return this;
  }

  public handleDeath(_world: World): void {
    // default no-op for inert entities
  }

  public afterMovement(_world: World): void {
    // default no-op for entities without post-move behavior
  }
}

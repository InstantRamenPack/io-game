import type { EntityKind } from "@shared/content/schema.ts";
import {
  getHitboxBounds,
  type HitboxBounds,
  type HitboxRect,
} from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";

/**
 * Client-side replica entity that stores authoritative net state only.
 * Rendering is handled by dedicated renderer classes outside this model.
 */
export class ClientEntity {
  public readonly id: number;
  public readonly kind: EntityKind;
  public readonly typeId: ResourceId;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public rotation: number;
  public hitboxes: readonly HitboxRect[];
  public hitboxBounds: HitboxBounds;
  public hp: number;
  public maxHp: number;
  public ownerId?: number;
  public name?: string;
  public label?: string;
  public tier?: number;
  public inventory?: InventorySnapshot;
  public activeEffects?: readonly ActiveEffectSnapshot[];
  public moveSpeed?: number;
  public targetId?: number;
  public serverX: number;
  public serverY: number;
  public prevServerX: number;
  public prevServerY: number;
  public visualVersion = 1;
  public healthVersion = 1;

  public constructor(snapshot: EntitySnapshot) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.typeId = snapshot.typeId;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.hitboxes = snapshot.hitboxes;
    this.hitboxBounds = getHitboxBounds(this.hitboxes);
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.prevServerX = snapshot.x;
    this.prevServerY = snapshot.y;

    this.applyKindSpecificFields(snapshot);
  }

  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public updateFromSnapshot(snapshot: EntitySnapshot): void {
    if (snapshot.id !== this.id) {
      throw new Error(
        `Snapshot id (${snapshot.id}) does not match entity id (${this.id}).`,
      );
    }
    if (snapshot.typeId !== this.typeId) {
      throw new Error(
        `Snapshot typeId (${snapshot.typeId}) does not match entity typeId (${this.typeId}).`,
      );
    }
    if (snapshot.kind !== this.kind) {
      throw new Error(
        `Snapshot kind (${snapshot.kind}) does not match entity kind (${this.kind}).`,
      );
    }

    this.prevServerX = this.serverX;
    this.prevServerY = this.serverY;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;

    if (!areHitboxesEqual(this.hitboxes, snapshot.hitboxes)) {
      this.hitboxes = snapshot.hitboxes;
      this.hitboxBounds = getHitboxBounds(this.hitboxes);
      this.visualVersion += 1;
      this.healthVersion += 1;
    }

    if (this.hp !== snapshot.hp || this.maxHp !== snapshot.maxHp) {
      this.healthVersion += 1;
    }

    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;

    this.applyKindSpecificFields(snapshot);
  }

  private applyKindSpecificFields(snapshot: EntitySnapshot): void {
    this.name = undefined;
    this.label = undefined;
    this.tier = undefined;
    this.inventory = undefined;
    this.activeEffects = undefined;
    this.moveSpeed = undefined;
    this.targetId = undefined;

    switch (snapshot.kind) {
      case "player":
        this.name = snapshot.name;
        this.inventory = snapshot.inventory;
        this.activeEffects = snapshot.activeEffects;
        this.moveSpeed = snapshot.moveSpeed;
        break;
      case "enemy":
        this.targetId = snapshot.targetId;
        break;
      case "building":
        this.label = snapshot.label;
        this.tier = snapshot.tier;
        break;
      case "pickup":
        this.inventory = snapshot.inventory;
        break;
      case "projectile":
        break;
    }
  }
}

function areHitboxesEqual(
  left: readonly HitboxRect[],
  right: readonly HitboxRect[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftHitbox = left[index];
    const rightHitbox = right[index];
    if (
      !leftHitbox ||
      !rightHitbox ||
      leftHitbox.offsetX !== rightHitbox.offsetX ||
      leftHitbox.offsetY !== rightHitbox.offsetY ||
      leftHitbox.width !== rightHitbox.width ||
      leftHitbox.height !== rightHitbox.height
    ) {
      return false;
    }
  }

  return true;
}

import type { EntityKind } from "@shared/content/schema.ts";
import {
  getHitboxBounds,
  type HitboxBounds,
  type HitboxRect,
} from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  ActiveEffectSnapshot,
  EquippedItemSnapshot,
  EntitySnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";

export type EntityServerFrame = {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
};

export type EntityPositionSample =
  | {
      mode: "hold";
      frame: EntityServerFrame;
    }
  | {
      mode: "interpolate";
      previous: EntityServerFrame;
      next: EntityServerFrame;
      alpha: number;
    }
  | {
      mode: "extrapolate";
      latest: EntityServerFrame;
      overrunTicks: number;
    };

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
  public alive: boolean;
  public ownerId?: number;
  public name?: string;
  public label?: string;
  public tier?: number;
  public inventory?: InventorySnapshot;
  public activeEffects?: readonly ActiveEffectSnapshot[];
  public moveSpeed?: number;
  public targetId?: number;
  public equippedItem?: EquippedItemSnapshot;
  public food?: number;
  public maxFood?: number;
  public serverX: number;
  public serverY: number;
  public visualVersion = 1;
  public healthVersion = 1;
  public stateVersion = 1;
  private readonly serverFrameHistoryLimit: number;
  private readonly serverFrameHistory: EntityServerFrame[] = [];

  constructor(
    snapshot: EntitySnapshot,
    tick: number,
    serverFrameHistoryLimit: number,
  ) {
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
    this.alive = snapshot.alive;
    this.ownerId = snapshot.ownerId;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.serverFrameHistoryLimit = Math.max(
      2,
      Math.floor(serverFrameHistoryLimit),
    );

    this.applyKindSpecificFields(snapshot);
    this.pushServerFrame(snapshot, tick);
  }

  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public updateFromSnapshot(snapshot: EntitySnapshot, tick: number): void {
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

    const previousServerX = this.serverX;
    const previousServerY = this.serverY;
    const previousVx = this.vx;
    const previousVy = this.vy;
    const previousRotation = this.rotation;
    const previousAlive = this.alive;
    const previousOwnerId = this.ownerId;
    const previousHp = this.hp;
    const previousMaxHp = this.maxHp;
    const previousFood = this.food;
    const previousMaxFood = this.maxFood;

    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.pushServerFrame(snapshot, tick);

    let hasStateChange =
      previousServerX !== this.serverX ||
      previousServerY !== this.serverY ||
      previousVx !== this.vx ||
      previousVy !== this.vy ||
      previousRotation !== this.rotation ||
      previousAlive !== snapshot.alive ||
      previousOwnerId !== snapshot.ownerId;

    if (!areHitboxesEqual(this.hitboxes, snapshot.hitboxes)) {
      this.hitboxes = snapshot.hitboxes;
      this.hitboxBounds = getHitboxBounds(this.hitboxes);
      this.visualVersion += 1;
      this.healthVersion += 1;
      hasStateChange = true;
    }

    if (previousHp !== snapshot.hp || previousMaxHp !== snapshot.maxHp) {
      this.healthVersion += 1;
      hasStateChange = true;
    }

    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.alive = snapshot.alive;
    this.ownerId = snapshot.ownerId;

    if (this.applyKindSpecificFields(snapshot)) {
      hasStateChange = true;
    }

    if (previousFood !== this.food || previousMaxFood !== this.maxFood) {
      this.healthVersion += 1;
      hasStateChange = true;
    }

    if (hasStateChange) {
      this.stateVersion += 1;
    }
  }

  public samplePosition(
    renderTick: number,
    maxExtrapolationTicks: number,
  ): EntityPositionSample | null {
    const latestFrame =
      this.serverFrameHistory[this.serverFrameHistory.length - 1];
    if (!latestFrame) {
      return null;
    }

    if (this.serverFrameHistory.length === 1) {
      return {
        mode: "hold",
        frame: latestFrame,
      };
    }

    const oldestFrame = this.serverFrameHistory[0];
    if (!oldestFrame) {
      return {
        mode: "hold",
        frame: latestFrame,
      };
    }

    if (renderTick <= oldestFrame.tick) {
      return {
        mode: "hold",
        frame: oldestFrame,
      };
    }

    for (
      let index = this.serverFrameHistory.length - 1;
      index > 0;
      index -= 1
    ) {
      const nextFrame = this.serverFrameHistory[index];
      const previousFrame = this.serverFrameHistory[index - 1];
      if (!nextFrame || !previousFrame) {
        continue;
      }
      if (renderTick < previousFrame.tick || renderTick > nextFrame.tick) {
        continue;
      }

      const spanTicks = Math.max(1, nextFrame.tick - previousFrame.tick);
      return {
        mode: "interpolate",
        previous: previousFrame,
        next: nextFrame,
        alpha: clamp((renderTick - previousFrame.tick) / spanTicks, 0, 1),
      };
    }

    if (renderTick > latestFrame.tick) {
      return {
        mode: "extrapolate",
        latest: latestFrame,
        overrunTicks: clamp(
          renderTick - latestFrame.tick,
          0,
          maxExtrapolationTicks,
        ),
      };
    }

    return {
      mode: "hold",
      frame: latestFrame,
    };
  }

  private applyKindSpecificFields(snapshot: EntitySnapshot): boolean {
    const previousName = this.name;
    const previousLabel = this.label;
    const previousTier = this.tier;
    const previousInventory = this.inventory;
    const previousEffects = this.activeEffects;
    const previousMoveSpeed = this.moveSpeed;
    const previousTargetId = this.targetId;
    const previousEquippedItem = this.equippedItem;
    const previousFood = this.food;
    const previousMaxFood = this.maxFood;

    this.name = undefined;
    this.label = undefined;
    this.tier = undefined;
    this.inventory = undefined;
    this.activeEffects = undefined;
    this.moveSpeed = undefined;
    this.targetId = undefined;
    this.equippedItem = undefined;
    this.food = undefined;
    this.maxFood = undefined;

    switch (snapshot.kind) {
      case "player":
        this.name = snapshot.name;
        this.inventory = snapshot.inventory;
        this.activeEffects = snapshot.activeEffects;
        this.moveSpeed = snapshot.moveSpeed;
        this.equippedItem = snapshot.equippedItem;
        this.food = snapshot.food;
        this.maxFood = snapshot.maxFood;
        break;
      case "enemy":
        this.targetId = snapshot.targetId;
        this.equippedItem = snapshot.equippedItem;
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

    return (
      previousName !== this.name ||
      previousLabel !== this.label ||
      previousTier !== this.tier ||
      previousInventory !== this.inventory ||
      previousEffects !== this.activeEffects ||
      previousMoveSpeed !== this.moveSpeed ||
      previousTargetId !== this.targetId ||
      previousEquippedItem !== this.equippedItem ||
      previousFood !== this.food ||
      previousMaxFood !== this.maxFood
    );
  }

  private pushServerFrame(snapshot: EntitySnapshot, tick: number): void {
    const latestFrame =
      this.serverFrameHistory[this.serverFrameHistory.length - 1];
    if (latestFrame && latestFrame.tick === tick) {
      latestFrame.x = snapshot.x;
      latestFrame.y = snapshot.y;
      latestFrame.vx = snapshot.vx;
      latestFrame.vy = snapshot.vy;
      latestFrame.rotation = snapshot.rotation;
      return;
    }

    this.serverFrameHistory.push({
      tick,
      x: snapshot.x,
      y: snapshot.y,
      vx: snapshot.vx,
      vy: snapshot.vy,
      rotation: snapshot.rotation,
    });
    if (this.serverFrameHistory.length > this.serverFrameHistoryLimit) {
      this.serverFrameHistory.splice(
        0,
        this.serverFrameHistory.length - this.serverFrameHistoryLimit,
      );
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

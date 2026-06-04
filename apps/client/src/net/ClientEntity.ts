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
  InventorySlotSnapshot,
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
  public chestSlots?: readonly InventorySlotSnapshot[];
  public inventory?: InventorySnapshot;
  public activeEffects?: readonly ActiveEffectSnapshot[];
  public moveSpeed?: number;
  public targetId?: number;
  public equippedItem?: EquippedItemSnapshot;
  public armorTypeId?: ResourceId;
  public armorTier?: 1 | 2 | 3 | 4;
  public armorDamageReductionPct?: number;
  public serverX: number;
  public serverY: number;
  public visualVersion = 1;
  public healthVersion = 1;
  public stateVersion = 1;
  public lastDiscontinuityTick: number | null = null;
  private readonly serverFrameHistoryLimit: number;
  private readonly serverFrameHistory: EntityServerFrame[] = [];

  constructor(
    snapshot: EntitySnapshot,
    tick: number,
    serverFrameHistoryLimit: number,
  ) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.typeId = requireSnapshotTypeId(snapshot);
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.hitboxes = requireSnapshotHitboxes(snapshot);
    this.hitboxBounds = getHitboxBounds(this.hitboxes);
    this.hp = requireSnapshotHp(snapshot);
    this.maxHp = requireSnapshotMaxHp(snapshot);
    this.alive = requireSnapshotAlive(snapshot);
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

  public updateFromSnapshot(
    snapshot: EntitySnapshot,
    tick: number,
    isFullSnapshot = false,
  ): void {
    if (snapshot.id !== this.id) {
      throw new Error(
        `Snapshot id (${snapshot.id}) does not match entity id (${this.id}).`,
      );
    }
    if (snapshot.typeId !== undefined && snapshot.typeId !== this.typeId) {
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

    const nextHp = snapshot.hp ?? this.hp;
    const nextMaxHp = snapshot.maxHp ?? this.maxHp;
    const nextAlive = snapshot.alive ?? this.alive;
    const nextOwnerId = "ownerId" in snapshot ? snapshot.ownerId : this.ownerId;

    const positionDiscontinuity =
      Math.hypot(snapshot.x - this.serverX, snapshot.y - this.serverY) >
      getDiscontinuityDistance(snapshot.kind);
    const aliveDiscontinuity = previousAlive !== nextAlive;
    if (positionDiscontinuity || aliveDiscontinuity) {
      this.serverFrameHistory.length = 0;
      this.x = snapshot.x;
      this.y = snapshot.y;
      this.lastDiscontinuityTick = tick;
    }

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
      previousAlive !== nextAlive ||
      previousOwnerId !== nextOwnerId;

    if (snapshot.hitboxes) {
      if (!areHitboxesEqual(this.hitboxes, snapshot.hitboxes)) {
        this.hitboxes = snapshot.hitboxes;
        this.hitboxBounds = getHitboxBounds(this.hitboxes);
        this.visualVersion += 1;
        this.healthVersion += 1;
        hasStateChange = true;
      }
    }

    if (previousHp !== nextHp || previousMaxHp !== nextMaxHp) {
      this.healthVersion += 1;
      hasStateChange = true;
    }

    this.hp = nextHp;
    this.maxHp = nextMaxHp;
    this.alive = nextAlive;
    this.ownerId = nextOwnerId;

    if (this.applyKindSpecificFields(snapshot, isFullSnapshot)) {
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
      if (this.kind === "projectile" && renderTick > latestFrame.tick) {
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

  public getServerFrameHistoryLength(): number {
    return this.serverFrameHistory.length;
  }

  public pushServerHoldFrame(tick: number): void {
    this.pushServerFrame(
      {
        x: this.serverX,
        y: this.serverY,
        vx: this.vx,
        vy: this.vy,
        rotation: this.rotation,
      },
      tick,
    );
  }

  private applyKindSpecificFields(
    snapshot: EntitySnapshot,
    isFullSnapshot = true,
  ): boolean {
    const previousName = this.name;
    const previousLabel = this.label;
    const previousTier = this.tier;
    const previousChestSlots = this.chestSlots;
    const previousInventory = this.inventory;
    const previousEffects = this.activeEffects;
    const previousMoveSpeed = this.moveSpeed;
    const previousTargetId = this.targetId;
    const previousEquippedItem = this.equippedItem;
    const previousArmorTypeId = this.armorTypeId;
    const previousArmorTier = this.armorTier;
    const previousArmorDamageReductionPct = this.armorDamageReductionPct;

    this.name = undefined;
    this.label = undefined;
    this.tier = undefined;
    this.chestSlots = undefined;
    this.inventory = undefined;
    this.activeEffects = undefined;
    this.moveSpeed = undefined;
    this.targetId = undefined;
    this.equippedItem = undefined;
    this.armorTypeId = undefined;
    this.armorTier = undefined;
    this.armorDamageReductionPct = undefined;

    switch (snapshot.kind) {
      case "player":
        this.name =
          isFullSnapshot || "name" in snapshot ? snapshot.name : previousName;
        this.inventory =
          isFullSnapshot || "inventory" in snapshot
            ? snapshot.inventory
            : previousInventory;
        this.activeEffects =
          isFullSnapshot || "activeEffects" in snapshot
            ? snapshot.activeEffects
            : previousEffects;
        this.moveSpeed =
          isFullSnapshot || "moveSpeed" in snapshot
            ? snapshot.moveSpeed
            : previousMoveSpeed;
        if (isFullSnapshot || "equippedItem" in snapshot) {
          this.equippedItem = snapshot.equippedItem;
        } else {
          this.equippedItem = previousEquippedItem;
        }
        if (isFullSnapshot || "armorTypeId" in snapshot) {
          this.armorTypeId = snapshot.armorTypeId;
        } else {
          this.armorTypeId = previousArmorTypeId;
        }
        if (isFullSnapshot || "armorTier" in snapshot) {
          this.armorTier = snapshot.armorTier;
        } else {
          this.armorTier = previousArmorTier;
        }
        if (isFullSnapshot || "armorDamageReductionPct" in snapshot) {
          this.armorDamageReductionPct = snapshot.armorDamageReductionPct;
        } else {
          this.armorDamageReductionPct = previousArmorDamageReductionPct;
        }
        break;
      case "enemy":
        if (isFullSnapshot || "targetId" in snapshot) {
          this.targetId = snapshot.targetId;
        } else {
          this.targetId = previousTargetId;
        }
        if (isFullSnapshot || "activeEffects" in snapshot) {
          this.activeEffects = snapshot.activeEffects;
        } else {
          this.activeEffects = previousEffects;
        }
        if (isFullSnapshot || "equippedItem" in snapshot) {
          this.equippedItem = snapshot.equippedItem;
        } else {
          this.equippedItem = previousEquippedItem;
        }
        if (isFullSnapshot || "armorTypeId" in snapshot) {
          this.armorTypeId = snapshot.armorTypeId;
        } else {
          this.armorTypeId = previousArmorTypeId;
        }
        if (isFullSnapshot || "armorTier" in snapshot) {
          this.armorTier = snapshot.armorTier;
        } else {
          this.armorTier = previousArmorTier;
        }
        if (isFullSnapshot || "armorDamageReductionPct" in snapshot) {
          this.armorDamageReductionPct = snapshot.armorDamageReductionPct;
        } else {
          this.armorDamageReductionPct = previousArmorDamageReductionPct;
        }
        break;
      case "building":
      case "tower":
        this.label =
          isFullSnapshot || "label" in snapshot
            ? snapshot.label
            : previousLabel;
        this.tier =
          isFullSnapshot || "tier" in snapshot ? snapshot.tier : previousTier;
        if (isFullSnapshot || "chestSlots" in snapshot) {
          this.chestSlots = snapshot.chestSlots;
        } else {
          this.chestSlots = previousChestSlots;
        }
        break;
      case "structure":
        this.label =
          isFullSnapshot || "label" in snapshot
            ? snapshot.label
            : previousLabel;
        break;
      case "pickup":
        this.inventory =
          isFullSnapshot || "inventory" in snapshot
            ? snapshot.inventory
            : previousInventory;
        if (previousInventory !== this.inventory) {
          this.visualVersion += 1;
        }
        break;
      case "projectile":
        break;
    }

    return (
      previousName !== this.name ||
      previousLabel !== this.label ||
      previousTier !== this.tier ||
      previousChestSlots !== this.chestSlots ||
      previousInventory !== this.inventory ||
      previousEffects !== this.activeEffects ||
      previousMoveSpeed !== this.moveSpeed ||
      previousTargetId !== this.targetId ||
      previousEquippedItem !== this.equippedItem ||
      previousArmorTypeId !== this.armorTypeId ||
      previousArmorTier !== this.armorTier ||
      previousArmorDamageReductionPct !== this.armorDamageReductionPct
    );
  }

  private pushServerFrame(
    snapshot: Pick<EntitySnapshot, "x" | "y" | "vx" | "vy" | "rotation">,
    tick: number,
  ): void {
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

function requireSnapshotHitboxes(
  snapshot: EntitySnapshot,
): readonly HitboxRect[] {
  if (!snapshot.hitboxes) {
    throw new Error(
      `Snapshot for new entity ${snapshot.id} (${snapshot.typeId}) is missing hitboxes.`,
    );
  }
  return snapshot.hitboxes;
}

function requireSnapshotTypeId(snapshot: EntitySnapshot): ResourceId {
  if (!snapshot.typeId) {
    throw new Error(
      `Snapshot for new entity ${snapshot.id} is missing typeId.`,
    );
  }
  return snapshot.typeId;
}

function requireSnapshotMaxHp(snapshot: EntitySnapshot): number {
  if (snapshot.maxHp === undefined) {
    throw new Error(
      `Snapshot for new entity ${snapshot.id} (${snapshot.typeId}) is missing maxHp.`,
    );
  }
  return snapshot.maxHp;
}

function requireSnapshotHp(snapshot: EntitySnapshot): number {
  if (snapshot.hp === undefined) {
    throw new Error(
      `Snapshot for new entity ${snapshot.id} (${snapshot.typeId}) is missing hp.`,
    );
  }
  return snapshot.hp;
}

function requireSnapshotAlive(snapshot: EntitySnapshot): boolean {
  if (snapshot.alive === undefined) {
    throw new Error(
      `Snapshot for new entity ${snapshot.id} (${snapshot.typeId}) is missing alive.`,
    );
  }
  return snapshot.alive;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDiscontinuityDistance(kind: EntityKind): number {
  switch (kind) {
    case "projectile":
      return 384;
    case "building":
    case "tower":
    case "structure":
    case "pickup":
      return 96;
    case "player":
    case "enemy":
      return 256;
  }
}

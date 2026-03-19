import type { EntityKind } from "@shared/content/types.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { NetEvent } from "@shared/net/events.ts";

export interface ItemStackSnapshotBase {
  id: number;
  typeId: ResourceId;
  stackSize: number;
  ownerId?: number;
}

export interface RangedWeaponStackSnapshot extends ItemStackSnapshotBase {
  ammoInMag: number;
  magSize: number;
  reloadTicksRemaining: number;
}

export type ItemStackSnapshot =
  | ItemStackSnapshotBase
  | RangedWeaponStackSnapshot;

export interface EntitySnapshotBase {
  id: number;
  kind: EntityKind;
  typeId: ResourceId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  radius: number;
  hp?: number;
  maxHp?: number;
  ownerId?: number;
}

export interface PlayerSnapshot extends EntitySnapshotBase {
  kind: "player";
  name: string;
  hp: number;
  maxHp: number;
  inventory: Array<ItemStackSnapshot | null>;
  activeSlot: number;
  activeEffects: string[];
  moveSpeed: number;
}

export interface EnemySnapshot extends EntitySnapshotBase {
  kind: "enemy";
  hp: number;
  maxHp: number;
  targetId?: number;
}

export interface BuildingSnapshot extends EntitySnapshotBase {
  kind: "building";
  label: string;
  hp: number;
  maxHp: number;
  tier: number;
}

export interface ProjectileSnapshot extends EntitySnapshotBase {
  kind: "projectile";
}

export interface PickupSnapshot extends EntitySnapshotBase {
  kind: "pickup";
  inventory: Array<ItemStackSnapshot | null>;
}

export type EntitySnapshot =
  | PlayerSnapshot
  | EnemySnapshot
  | BuildingSnapshot
  | ProjectileSnapshot
  | PickupSnapshot;

export interface WorldSnapshot {
  tick: number;
  entities: EntitySnapshot[];
  events: NetEvent[];
}

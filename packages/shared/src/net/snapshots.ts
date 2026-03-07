import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { ItemKind } from "@shared/ids/ItemKinds";
import type { NetEvent } from "@shared/net/events.ts";

/** Serialized representation of one entity in an authoritative snapshot. */
export interface EntitySnapshot {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  radius: number;
  hp?: number;
  maxHp?: number;
  ownerId?: number;
  data?: Record<string, unknown>;
}

/** Serialized representation of full world state at one server tick. */
export interface WorldSnapshot {
  tick: number;
  timeMs: number;
  entities: EntitySnapshot[];
  events: NetEvent[];
}


export interface ItemSnapshot {
  id: number;
  kind: ItemKind;
  ownerId?: number;
  data?: Record<string, unknown>;
}

export interface ItemStackSnapshot {
  id: number;
  kind: ItemKind;
  stackSize: number;
  ownerId?: number;
  data?: Record<string, unknown>;
}
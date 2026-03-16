import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { ItemKind } from "@shared/ids/ItemKinds";
import type { NetEvent } from "@shared/net/events.ts";

/**
 * Serialized representation of one entity in an authoritative snapshot.
 * This is the per-entity payload replicated from server to client.
 */
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
  name?: string;

  inventory?: Array<ItemStackSnapshot | null>;
  activeSlot?: number;
}

/**
 * Serialized representation of full world state at one server tick.
 * Combines replicated entities with any discrete events emitted for that frame.
 */
export interface WorldSnapshot {
  tick: number;
  entities: EntitySnapshot[];
  events: NetEvent[];
}


export interface ItemStackSnapshot {
  id: number;
  kind: ItemKind;
  stackSize: number;
  ownerId?: number;
  data?: Record<string, unknown>;
}

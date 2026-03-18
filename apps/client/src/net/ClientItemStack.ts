import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Client-side representation of an item stack snapshot.
 * Pure data holder (no renderer dependency).
 */
export class ClientItemStack {
  public readonly id: number;
  public readonly typeId: ResourceId;
  public readonly stackSize: number;
  public readonly ownerId?: number;
  public readonly data?: Record<string, unknown>;

  constructor(snapshot: ItemStackSnapshot) {
    this.id = snapshot.id;
    this.typeId = snapshot.typeId;
    this.stackSize = snapshot.stackSize;
    this.ownerId = snapshot.ownerId;
    this.data = snapshot.data;
  }
}

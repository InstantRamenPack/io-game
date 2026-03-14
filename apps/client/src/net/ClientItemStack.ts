import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";
import type { ItemKind } from "@shared/ids/ItemKinds";

/**
 * Client-side representation of an item stack snapshot.
 * Pure data holder (no renderer dependency).
 */
export class ClientItemStack {
  public readonly id: number;
  public readonly kind: ItemKind;
  public readonly stackSize: number;
  public readonly ownerId?: number;

  constructor(snapshot: ItemStackSnapshot) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.stackSize = snapshot.stackSize;
    this.ownerId = snapshot.ownerId;
  }
}

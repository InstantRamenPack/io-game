import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";

/**
 * Client-side representation of an item stack snapshot.
 * Pure data holder with typed weapon runtime fields when present.
 */
export class ClientItemStack {
  public readonly id: number;
  public readonly typeId: ResourceId;
  public readonly stackSize: number;
  public readonly ownerId?: number;
  public readonly ammoInMag?: number;
  public readonly magSize?: number;
  public readonly reloadTicksRemaining?: number;

  public constructor(snapshot: ItemStackSnapshot) {
    this.id = snapshot.id;
    this.typeId = snapshot.typeId;
    this.stackSize = snapshot.stackSize;
    this.ownerId = snapshot.ownerId;

    if ("ammoInMag" in snapshot) {
      this.ammoInMag = snapshot.ammoInMag;
      this.magSize = snapshot.magSize;
      this.reloadTicksRemaining = snapshot.reloadTicksRemaining;
    }
  }
}

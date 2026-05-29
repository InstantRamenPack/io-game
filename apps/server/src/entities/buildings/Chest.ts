import { Building } from "@server/entities/Building.ts";
import type {
  BuildingSnapshot,
  InventorySlotSnapshot,
} from "@shared/net/snapshots.ts";
import { CHEST_SLOT_COUNT } from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ChestSlot =
  | { kind: "buildable"; typeId: ResourceId; count: number }
  | { kind: "weapon"; typeId: ResourceId }
  | null;

export class Chest extends Building {
  public static override readonly resourceName = "chest";
  public readonly chestSlots: ChestSlot[] = Array.from(
    { length: CHEST_SLOT_COUNT },
    () => null,
  );

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }

  public getSlot(index: number): ChestSlot {
    return this.chestSlots[index] ?? null;
  }

  public setSlot(index: number, slot: ChestSlot): void {
    if (index >= 0 && index < this.chestSlots.length) {
      this.chestSlots[index] = slot;
    }
  }

  public override toSnapshot(): BuildingSnapshot {
    const snapshot = super.toSnapshot() as BuildingSnapshot;
    return {
      ...snapshot,
      chestSlots: this.chestSlots.map(
        (slot): InventorySlotSnapshot =>
          slot === null
            ? { kind: "empty" }
            : slot.kind === "buildable"
              ? { kind: "buildable", typeId: slot.typeId, count: slot.count }
              : { kind: "weapon", typeId: slot.typeId },
      ),
    };
  }
}

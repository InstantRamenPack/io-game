import type { ChestSlot } from "@server/entities/buildings/Chest.ts";
import { Tower } from "@server/entities/buildings/Tower.ts";
import type {
  BuildingSnapshot,
  InventorySlotSnapshot,
  TowerSnapshot,
} from "@shared/net/snapshots.ts";
import { CHEST_SLOT_COUNT } from "@shared/net/snapshots.ts";

/** Home-sector tower hub: crafting, recycling, and shared storage. */
export class Hub extends Tower {
  public static override readonly resourceName = "hub";
  public readonly chestSlots: ChestSlot[] = Array.from(
    { length: CHEST_SLOT_COUNT },
    () => null,
  );

  constructor(id: number) {
    super(id, 1, undefined);
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
    const snapshot = super.toSnapshot() as unknown as TowerSnapshot;
    const towerSnapshot: TowerSnapshot = {
      ...snapshot,
      kind: "tower",
      chestSlots: this.chestSlots.map(
        (slot): InventorySlotSnapshot =>
          slot === null
            ? { kind: "empty" }
            : slot.kind === "buildable"
              ? { kind: "buildable", typeId: slot.typeId, count: slot.count }
              : { kind: "weapon", typeId: slot.typeId },
      ),
    };
    return towerSnapshot as unknown as BuildingSnapshot;
  }
}

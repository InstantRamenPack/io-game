import type { ClientEntity } from "@client/net/ClientEntity.ts";
import {
  getItemContent,
  getItemRecycleHunkValue,
} from "@shared/content/catalog.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";
import { RECYCLER_INTERACT_PADDING } from "@shared/gameplay/constants.ts";

type HeldInventorySlot = Exclude<
  InventorySnapshot["hotbarSlots"][number],
  { kind: "empty" }
>;

export function isPlayerNearRecycler(
  player: ClientEntity,
  recycler: ClientEntity,
): boolean {
  const rb = recycler.hitboxBounds;
  return (
    player.x >= recycler.x + rb.minX - RECYCLER_INTERACT_PADDING &&
    player.x <= recycler.x + rb.maxX + RECYCLER_INTERACT_PADDING &&
    player.y >= recycler.y + rb.minY - RECYCLER_INTERACT_PADDING &&
    player.y <= recycler.y + rb.maxY + RECYCLER_INTERACT_PADDING
  );
}

export function isHoldingRecyclableItem(inventory: InventorySnapshot): boolean {
  const slot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
  if (!slot || slot.kind === "empty") {
    return false;
  }
  return isRecyclableItem(slot);
}

function isRecyclableItem(slot: HeldInventorySlot): boolean {
  const recycleValue = getItemRecycleHunkValue(slot.typeId);
  if (recycleValue !== undefined) {
    return recycleValue > 0;
  }

  return !(slot.kind === "weapon" && getItemContent(slot.typeId)?.hidden);
}

export function isNearRecyclerWithItem(
  player: ClientEntity | undefined,
  recyclers: ClientEntity[],
  inventory: InventorySnapshot | undefined,
): boolean {
  if (!player || !inventory) {
    return false;
  }
  if (!isHoldingRecyclableItem(inventory)) {
    return false;
  }
  return recyclers.some((r) => isPlayerNearRecycler(player, r));
}

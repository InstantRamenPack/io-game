import type { PointerInput } from "@client/client/clientTypes.ts";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import { sanitizeHotbarEditState } from "@client/render/hud/hotbarEditModel.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";

export class InventoryEditCoordinator {
  private draggedInventorySlotIndex: number | null = null;

  public open(state: HudInteractionState): void {
    state.inventoryOpen = true;
    this.clearDragState(state);
  }

  public close(state: HudInteractionState): void {
    state.inventoryOpen = false;
    this.clearDragState(state);
  }

  public reset(state: HudInteractionState): void {
    this.close(state);
  }

  public sanitizeState(
    state: HudInteractionState,
    hotbarItems: HotbarSlotItem[],
  ): void {
    const { hoveredSlotIndex, heldSlotIndex } = sanitizeHotbarEditState({
      inventoryOpen: state.inventoryOpen,
      hoveredSlotIndex: state.hoveredInventorySlotIndex,
      heldSlotIndex: state.heldInventorySlotIndex,
      hotbarItems,
    });

    state.hoveredInventorySlotIndex = hoveredSlotIndex;
    state.heldInventorySlotIndex = heldSlotIndex;
    if (!state.inventoryOpen || heldSlotIndex === null) {
      this.draggedInventorySlotIndex = null;
    }
  }

  public handlePointerInput(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    hotbarItems: HotbarSlotItem[];
    getSlotIndexAtPoint: (screenX: number, screenY: number) => number | null;
    queueInventoryMove: (fromSlotIndex: number, toSlotIndex: number) => void;
    markDirty: () => void;
  }): boolean {
    const {
      state,
      pointer,
      hotbarItems,
      getSlotIndexAtPoint,
      queueInventoryMove,
      markDirty,
    } = options;
    const hoveredSlotIndex = getSlotIndexAtPoint(
      pointer.screenX,
      pointer.screenY,
    );
    if (hoveredSlotIndex !== state.hoveredInventorySlotIndex) {
      state.hoveredInventorySlotIndex = hoveredSlotIndex;
      markDirty();
    }

    if (pointer.kind === "move") {
      return true;
    }

    if (pointer.kind === "up") {
      if (
        this.draggedInventorySlotIndex !== null &&
        hoveredSlotIndex !== null &&
        hoveredSlotIndex !== this.draggedInventorySlotIndex
      ) {
        queueInventoryMove(this.draggedInventorySlotIndex, hoveredSlotIndex);
        this.clearDragState(state);
        markDirty();
      }
      this.draggedInventorySlotIndex = null;
      return true;
    }

    if (hoveredSlotIndex === null) {
      this.clearDragState(state);
      markDirty();
      return true;
    }

    const item = hotbarItems[hoveredSlotIndex];
    if (state.heldInventorySlotIndex !== null) {
      if (state.heldInventorySlotIndex === hoveredSlotIndex) {
        this.draggedInventorySlotIndex = hoveredSlotIndex;
        return true;
      }

      queueInventoryMove(state.heldInventorySlotIndex, hoveredSlotIndex);
      this.clearDragState(state);
      markDirty();
      return true;
    }

    if (!item?.typeId) {
      return true;
    }

    state.heldInventorySlotIndex = hoveredSlotIndex;
    this.draggedInventorySlotIndex = hoveredSlotIndex;
    markDirty();
    return true;
  }

  private clearDragState(state: HudInteractionState): void {
    state.heldInventorySlotIndex = null;
    this.draggedInventorySlotIndex = null;
  }
}

import type { PointerInput } from "@client/client/clientTypes.ts";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import { sanitizeHotbarEditState } from "@client/render/hud/hotbarEditModel.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";
import type { InventorySlotRef } from "@client/render/hud/InventoryView.ts";

export class InventoryEditCoordinator {
  private draggedInventorySlotRef: InventorySlotRef | null = null;

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
    armorItem: HotbarSlotItem,
  ): void {
    const { hoveredSlotRef, heldSlotRef } = sanitizeHotbarEditState({
      inventoryOpen: state.inventoryOpen,
      hoveredSlotRef: state.hoveredInventorySlotRef,
      heldSlotRef: state.heldInventorySlotRef,
      hotbarItems,
      armorItem,
    });

    state.hoveredInventorySlotRef = hoveredSlotRef;
    state.heldInventorySlotRef = heldSlotRef;
    if (!state.inventoryOpen || heldSlotRef === null) {
      this.draggedInventorySlotRef = null;
    }
  }

  public handlePointerInput(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    hotbarItems: HotbarSlotItem[];
    armorItem: HotbarSlotItem;
    getSlotRefAtPoint: (
      screenX: number,
      screenY: number,
    ) => InventorySlotRef | null;
    queueInventoryMove: (from: InventorySlotRef, to: InventorySlotRef) => void;
    markDirty: () => void;
  }): boolean {
    const {
      state,
      pointer,
      hotbarItems,
      armorItem,
      getSlotRefAtPoint,
      queueInventoryMove,
      markDirty,
    } = options;
    const hoveredSlotRef = getSlotRefAtPoint(pointer.screenX, pointer.screenY);
    const sameHoveredRef =
      hoveredSlotRef?.source === state.hoveredInventorySlotRef?.source &&
      hoveredSlotRef?.index === state.hoveredInventorySlotRef?.index;
    if (!sameHoveredRef) {
      state.hoveredInventorySlotRef = hoveredSlotRef;
      markDirty();
    }

    if (pointer.kind === "move") {
      return true;
    }

    if (pointer.kind === "up") {
      if (
        this.draggedInventorySlotRef !== null &&
        hoveredSlotRef !== null &&
        (hoveredSlotRef.source !== this.draggedInventorySlotRef.source ||
          hoveredSlotRef.index !== this.draggedInventorySlotRef.index)
      ) {
        queueInventoryMove(this.draggedInventorySlotRef, hoveredSlotRef);
        this.clearDragState(state);
        markDirty();
      }
      this.draggedInventorySlotRef = null;
      return true;
    }

    if (hoveredSlotRef === null) {
      this.clearDragState(state);
      markDirty();
      return true;
    }

    const item =
      hoveredSlotRef.source === "armor"
        ? armorItem
        : hotbarItems[hoveredSlotRef.index];
    if (state.heldInventorySlotRef !== null) {
      if (
        state.heldInventorySlotRef.source === hoveredSlotRef.source &&
        state.heldInventorySlotRef.index === hoveredSlotRef.index
      ) {
        this.draggedInventorySlotRef = hoveredSlotRef;
        return true;
      }

      queueInventoryMove(state.heldInventorySlotRef, hoveredSlotRef);
      this.clearDragState(state);
      markDirty();
      return true;
    }

    if (!item?.typeId) {
      return true;
    }

    state.heldInventorySlotRef = hoveredSlotRef;
    this.draggedInventorySlotRef = hoveredSlotRef;
    markDirty();
    return true;
  }

  private clearDragState(state: HudInteractionState): void {
    state.heldInventorySlotRef = null;
    this.draggedInventorySlotRef = null;
  }
}

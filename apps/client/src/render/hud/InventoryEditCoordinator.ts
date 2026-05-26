import type { PointerInput } from "@client/client/clientTypes.ts";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import { sanitizeHotbarEditState } from "@client/render/hud/hotbarEditModel.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";
import type { InventorySlotRef } from "@client/render/hud/InventoryView.ts";

export class InventoryEditCoordinator {
  private draggedInventorySlotRef: InventorySlotRef | null = null;
  private pointerDown: {
    ref: InventorySlotRef;
    screenX: number;
    screenY: number;
  } | null = null;
  private static readonly DRAG_THRESHOLD_PX = 8;

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
    const { hoveredSlotRef, heldSlotRef } = sanitizeHotbarEditState({
      inventoryOpen: state.inventoryOpen,
      hoveredSlotRef: state.hoveredInventorySlotRef,
      heldSlotRef: state.heldInventorySlotRef,
      hotbarItems,
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
      if (
        this.pointerDown &&
        this.draggedInventorySlotRef === null &&
        state.heldInventorySlotRef
      ) {
        const dx = pointer.screenX - this.pointerDown.screenX;
        const dy = pointer.screenY - this.pointerDown.screenY;
        if (Math.hypot(dx, dy) >= InventoryEditCoordinator.DRAG_THRESHOLD_PX) {
          this.draggedInventorySlotRef = this.pointerDown.ref;
        }
      }
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
      this.pointerDown = null;
      this.draggedInventorySlotRef = null;
      return true;
    }

    if (hoveredSlotRef === null) {
      this.clearDragState(state);
      this.pointerDown = null;
      markDirty();
      return true;
    }

    const item = hotbarItems[hoveredSlotRef.index];
    if (state.heldInventorySlotRef !== null) {
      if (
        state.heldInventorySlotRef.source === hoveredSlotRef.source &&
        state.heldInventorySlotRef.index === hoveredSlotRef.index
      ) {
        this.pointerDown = {
          ref: hoveredSlotRef,
          screenX: pointer.screenX,
          screenY: pointer.screenY,
        };
        return true;
      }

      queueInventoryMove(state.heldInventorySlotRef, hoveredSlotRef);
      this.clearDragState(state);
      this.pointerDown = null;
      markDirty();
      return true;
    }

    if (!item?.typeId) {
      return true;
    }

    state.heldInventorySlotRef = hoveredSlotRef;
    this.pointerDown = {
      ref: hoveredSlotRef,
      screenX: pointer.screenX,
      screenY: pointer.screenY,
    };
    markDirty();
    return true;
  }

  private clearDragState(state: HudInteractionState): void {
    state.heldInventorySlotRef = null;
    this.draggedInventorySlotRef = null;
    this.pointerDown = null;
  }
}

import type { PointerInput } from "@client/client/clientTypes.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";
import type { ChestSlotRef } from "@client/render/hud/ChestView.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import {
  findChestAtWorldPoint,
  isPlayerNearChest,
} from "@client/render/hud/chestInteraction.ts";
import type { InventorySlotSnapshot } from "@shared/net/snapshots.ts";
import { CHEST_SLOT_COUNT } from "@shared/gameplay/constants.ts";

export class ChestHudCoordinator {
  private draggedRef: ChestSlotRef | null = null;

  public open(state: HudInteractionState, chestEntityId: number): void {
    state.chestOpen = true;
    state.openChestEntityId = chestEntityId;
    this.clearDragState(state);
  }

  public close(state: HudInteractionState): void {
    state.chestOpen = false;
    state.openChestEntityId = null;
    this.clearDragState(state);
  }

  public reset(state: HudInteractionState): void {
    this.close(state);
  }

  public syncProximity(
    state: HudInteractionState,
    selectors: GameSelectors,
  ): { changed: boolean } {
    if (!state.chestOpen || state.openChestEntityId === null) {
      return { changed: false };
    }
    const chests = selectors.getChests();
    const openChest = chests.find((c) => c.id === state.openChestEntityId);
    if (
      !openChest ||
      !isPlayerNearChest(selectors.getPlayerEntity(), openChest)
    ) {
      this.close(state);
      return { changed: true };
    }
    return { changed: false };
  }

  public handlePointerInput(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    getSlotRefAtPoint: (
      screenX: number,
      screenY: number,
    ) => ChestSlotRef | null;
    getSlotItem: (ref: ChestSlotRef) => { typeId: string | null } | null;
    queueChestMove: (from: ChestSlotRef, to: ChestSlotRef) => void;
    markDirty: () => void;
  }): boolean {
    const {
      state,
      pointer,
      getSlotRefAtPoint,
      getSlotItem,
      queueChestMove,
      markDirty,
    } = options;

    const hoveredRef = getSlotRefAtPoint(pointer.screenX, pointer.screenY);
    const prevHovered = state.hoveredChestSlotRef;
    if (
      hoveredRef?.source !== prevHovered?.source ||
      hoveredRef?.index !== prevHovered?.index
    ) {
      state.hoveredChestSlotRef = hoveredRef;
      markDirty();
    }

    if (pointer.kind === "move") {
      return true;
    }

    if (pointer.kind === "up") {
      if (
        this.draggedRef !== null &&
        hoveredRef !== null &&
        (this.draggedRef.source !== hoveredRef.source ||
          this.draggedRef.index !== hoveredRef.index)
      ) {
        queueChestMove(this.draggedRef, hoveredRef);
      }
      this.clearDragState(state);
      markDirty();
      return true;
    }

    if (hoveredRef === null) {
      this.clearDragState(state);
      markDirty();
      return true;
    }

    const item = getSlotItem(hoveredRef);
    if (state.heldChestSlotRef !== null) {
      const held = state.heldChestSlotRef;
      if (
        held.source === hoveredRef.source &&
        held.index === hoveredRef.index
      ) {
        this.draggedRef = hoveredRef;
        return true;
      }
      queueChestMove(held, hoveredRef);
      this.clearDragState(state);
      markDirty();
      return true;
    }

    if (!item?.typeId) {
      return true;
    }

    state.heldChestSlotRef = hoveredRef;
    this.draggedRef = hoveredRef;
    markDirty();
    return true;
  }

  public handleGameplayPointerDown(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    selectors: GameSelectors;
    openChest: (chestEntityId: number) => void;
    queueBuildPlacement: (x: number, y: number) => void;
  }): boolean {
    const { state, pointer, selectors, openChest, queueBuildPlacement } =
      options;
    if (state.chestOpen) {
      return true;
    }

    const clickedChest = findChestAtWorldPoint(
      selectors.getChests(),
      pointer.worldX,
      pointer.worldY,
    );
    if (
      clickedChest &&
      isPlayerNearChest(selectors.getPlayerEntity(), clickedChest)
    ) {
      openChest(clickedChest.id);
      return true;
    }

    const inventory = selectors.getInventory();
    const selectedSlot =
      inventory?.hotbarSlots[inventory.selectedHotbarIndex ?? 0] ?? null;
    if (selectedSlot?.kind === "buildable") {
      queueBuildPlacement(pointer.worldX, pointer.worldY);
      return true;
    }

    return false;
  }

  public getOpenChestSlots(
    state: HudInteractionState,
    selectors: GameSelectors,
  ): readonly InventorySlotSnapshot[] | null {
    if (!state.chestOpen || state.openChestEntityId === null) {
      return null;
    }
    const chests = selectors.getChests();
    const chest = chests.find((c) => c.id === state.openChestEntityId);
    return chest?.chestSlots ?? buildEmptyChestSlots();
  }

  private clearDragState(state: HudInteractionState): void {
    state.heldChestSlotRef = null;
    this.draggedRef = null;
  }
}

function buildEmptyChestSlots(): readonly InventorySlotSnapshot[] {
  return Array.from({ length: CHEST_SLOT_COUNT }, () => ({
    kind: "empty" as const,
  }));
}

import * as PIXI from "pixi.js";
import type { Rect } from "@client/render/renderTypes.ts";
import {
  CraftingModal,
  type CraftingModalEntry,
  type CraftingModalTab,
} from "@client/render/hud/CraftingModal.ts";
import { ChestView, type ChestSlotRef } from "@client/render/hud/ChestView.ts";
import type { CraftingTabId } from "@client/render/hud/HudInteractionState.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySlotSnapshot } from "@shared/net/snapshots.ts";

const HUB_MIN_CRAFT_WIDTH = 520;
const HUB_COLUMN_GAP = 14;
const HUB_SCREEN_PADDING = 32;

type CraftingModalStyles = ConstructorParameters<typeof CraftingModal>[0];

export class HubModalView {
  public readonly container = new PIXI.Container();
  private readonly craftingModal: CraftingModal;
  private readonly chestView: ChestView;

  constructor(options: {
    craftingStyles: CraftingModalStyles;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
  }) {
    this.craftingModal = new CraftingModal(options.craftingStyles);
    this.chestView = new ChestView({ iconProvider: options.iconProvider });
    this.container.addChild(
      this.craftingModal.container,
      this.chestView.container,
    );
  }

  public sync(options: {
    screenWidth: number;
    screenHeight: number;
    craftingVisible: boolean;
    storageVisible: boolean;
    craftEntries: CraftingModalEntry[];
    tabs: readonly CraftingModalTab[];
    activeTab: CraftingTabId;
    selectedCraft: ResourceId;
    previewedCraft: ResourceId;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    craftButtonEnabled: boolean;
    previewStatusLabel: string;
    chestSlots: readonly InventorySlotSnapshot[];
    hotbarSlots: readonly InventorySlotSnapshot[];
    hoveredChestRef: ChestSlotRef | null;
    heldChestRef: ChestSlotRef | null;
    recycleHotbarIndex: number | null;
    recycleChestIndex: number | null;
    recycleItemLabel: string;
    recycleEnabled: boolean;
    recycleDropHovered: boolean;
    recycleIconProvider: (hotbarIndex: number) => PIXI.Texture | null;
    recycleChestIconProvider: (chestIndex: number) => PIXI.Texture | null;
  }): void {
    const dockStorageRight =
      options.craftingVisible &&
      options.storageVisible &&
      options.screenWidth >=
        this.chestView.getPreferredSize().width +
          HUB_MIN_CRAFT_WIDTH +
          HUB_COLUMN_GAP +
          HUB_SCREEN_PADDING;
    const companionColumnWidth = dockStorageRight
      ? this.chestView.getPreferredSize().width
      : null;

    this.container.visible = options.craftingVisible || options.storageVisible;
    this.craftingModal.sync({
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      entries: options.craftEntries,
      tabs: options.tabs,
      activeTab: options.activeTab,
      selectedCraft: options.selectedCraft,
      previewedCraft: options.previewedCraft,
      iconProvider: options.iconProvider,
      craftButtonEnabled: options.craftButtonEnabled,
      previewStatusLabel: options.previewStatusLabel,
      companionColumnWidth,
      visible: options.craftingVisible,
    });

    const craftingRect = options.craftingVisible
      ? this.craftingModal.getModalRect()
      : null;
    this.chestView.sync({
      visible: options.storageVisible,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      chestSlots: options.chestSlots,
      hotbarSlots: options.hotbarSlots,
      hoveredRef: options.hoveredChestRef,
      heldRef: options.heldChestRef,
      dockRightOfModal: dockStorageRight ? craftingRect : null,
      stackBelowModal:
        !dockStorageRight && options.craftingVisible ? craftingRect : null,
      recycleHotbarIndex: options.recycleHotbarIndex,
      recycleChestIndex: options.recycleChestIndex,
      recycleItemLabel: options.recycleItemLabel,
      recycleEnabled: options.recycleEnabled,
      recycleDropHovered: options.recycleDropHovered,
      recycleIconProvider: options.recycleIconProvider,
      recycleChestIconProvider: options.recycleChestIconProvider,
    });
  }

  public containsPoint(screenX: number, screenY: number): boolean {
    return (
      this.craftingModal.containsPoint(screenX, screenY) ||
      this.chestView.containsPoint(screenX, screenY)
    );
  }

  public getCraftAtPoint(screenX: number, screenY: number): ResourceId | null {
    return this.craftingModal.getCraftAtPoint(screenX, screenY);
  }

  public getPreviewedCraftAtPoint(
    screenX: number,
    screenY: number,
    previewedCraft: ResourceId,
  ): ResourceId | null {
    return this.craftingModal.getPreviewedCraftAtPoint(
      screenX,
      screenY,
      previewedCraft,
    );
  }

  public isCraftOutputAtPoint(screenX: number, screenY: number): boolean {
    return this.craftingModal.isCraftOutputAtPoint(screenX, screenY);
  }

  public getTabAtPoint(screenX: number, screenY: number): CraftingTabId | null {
    return this.craftingModal.getTabAtPoint(screenX, screenY);
  }

  public scrollBy(deltaRows: number): boolean {
    return this.craftingModal.scrollBy(deltaRows);
  }

  public getCraftRect(typeId: ResourceId): Rect | null {
    return this.craftingModal.getCraftRect(typeId);
  }

  public getPreviewRect(): Rect | null {
    return this.craftingModal.getPreviewRect();
  }

  public getSlotRefAtPoint(
    screenX: number,
    screenY: number,
  ): ChestSlotRef | null {
    return this.chestView.getSlotRefAtPoint(screenX, screenY);
  }

  public isRecycleDropAtPoint(screenX: number, screenY: number): boolean {
    return this.chestView.isRecycleDropAtPoint(screenX, screenY);
  }

  public isRecycleButtonAtPoint(screenX: number, screenY: number): boolean {
    return this.chestView.isRecycleButtonAtPoint(screenX, screenY);
  }
}

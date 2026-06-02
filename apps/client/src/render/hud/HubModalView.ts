import * as PIXI from "pixi.js";
import type { Rect } from "@client/render/renderTypes.ts";
import { syncItemIconSprite } from "@client/render/hud/itemIconRendering.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
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
const RECYCLE_PANEL_HEIGHT = 88;
const RECYCLE_BUTTON_HEIGHT = 44;

type CraftingModalStyles = ConstructorParameters<typeof CraftingModal>[0];

class RecyclePanelView {
  public readonly container = new PIXI.Container();
  private readonly panel = new PIXI.Graphics();
  private readonly title: PIXI.Text;
  private readonly drop = new PIXI.Graphics();
  private readonly icon = new PIXI.Sprite();
  private readonly label: PIXI.Text;
  private readonly button = new PIXI.Graphics();
  private readonly buttonLabel: PIXI.Text;
  private rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private dropRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private buttonRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    this.title = new PIXI.Text(
      "Recycle",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 11,
        fill: 0x8dcf9a,
        letterSpacing: 0.8,
      }),
    );
    this.icon.anchor.set(0.5);
    this.label = new PIXI.Text(
      "Drag an item here",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 13,
        fill: 0xe8f5e7,
      }),
    );
    this.label.anchor.set(0, 0.5);
    this.buttonLabel = new PIXI.Text(
      "Recycle",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 13,
        fill: 0xf1f6ef,
      }),
    );
    this.buttonLabel.anchor.set(0.5);
    this.container.addChild(
      this.panel,
      this.title,
      this.drop,
      this.icon,
      this.label,
      this.button,
      this.buttonLabel,
    );
  }

  public sync(options: {
    visible: boolean;
    x: number;
    y: number;
    width: number;
    recycleHotbarIndex: number | null;
    recycleChestIndex: number | null;
    recycleItemLabel: string;
    recycleEnabled: boolean;
    recycleDropHovered: boolean;
    recycleIconProvider:
      | ((
          hotbarIndex: number,
        ) => { typeId: ResourceId; texture: PIXI.Texture } | null)
      | null;
    recycleChestIconProvider:
      | ((
          chestIndex: number,
        ) => { typeId: ResourceId; texture: PIXI.Texture } | null)
      | null;
  }): void {
    this.container.visible = options.visible;
    if (!options.visible) {
      this.rect = { x: 0, y: 0, width: 0, height: 0 };
      this.dropRect = { x: 0, y: 0, width: 0, height: 0 };
      this.buttonRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    this.container.position.set(options.x, options.y);
    this.rect = {
      x: options.x,
      y: options.y,
      width: options.width,
      height: RECYCLE_PANEL_HEIGHT,
    };
    drawRoundedRect(
      this.panel,
      0,
      0,
      options.width,
      RECYCLE_PANEL_HEIGHT,
      18,
      { color: 0x101913, alpha: 0.96 },
      { width: 2, color: 0x3d8b5a, alpha: 0.55 },
    );
    this.title.position.set(20, 10);

    const dropSize = 48;
    const dropX = 20;
    const dropY = 30;
    this.dropRect = {
      x: options.x + dropX,
      y: options.y + dropY,
      width: dropSize,
      height: dropSize,
    };
    const hasStaged =
      options.recycleHotbarIndex !== null || options.recycleChestIndex !== null;
    const dropBorderColor = options.recycleDropHovered
      ? 0x5cce6a
      : hasStaged
        ? 0x6ea8ff
        : 0x4a5a72;
    drawRoundedRect(
      this.drop,
      dropX,
      dropY,
      dropSize,
      dropSize,
      10,
      { color: options.recycleDropHovered ? 0x0f2a14 : 0x17233a, alpha: 0.95 },
      { width: 2, color: dropBorderColor, alpha: 0.9 },
    );

    const icon =
      options.recycleHotbarIndex !== null
        ? options.recycleIconProvider?.(options.recycleHotbarIndex)
        : options.recycleChestIndex !== null
          ? options.recycleChestIconProvider?.(options.recycleChestIndex)
          : null;
    if (icon) {
      syncItemIconSprite({
        sprite: this.icon,
        typeId: icon.typeId,
        texture: icon.texture,
        boxSize: 34,
        centerX: dropX + dropSize / 2,
        centerY: dropY + dropSize / 2,
      });
      this.label.text = options.recycleItemLabel;
    } else {
      this.icon.visible = false;
      this.label.text = "Drag an item here";
    }
    this.label.position.set(dropX + dropSize + 12, dropY + dropSize / 2);

    const buttonWidth = 138;
    const buttonX = options.width - buttonWidth - 20;
    const buttonY = dropY + 2;
    this.buttonRect = {
      x: options.x + buttonX,
      y: options.y + buttonY,
      width: buttonWidth,
      height: RECYCLE_BUTTON_HEIGHT,
    };
    drawRoundedRect(
      this.button,
      buttonX,
      buttonY,
      buttonWidth,
      RECYCLE_BUTTON_HEIGHT,
      12,
      {
        color: options.recycleEnabled ? 0x24402f : 0x1a201b,
        alpha: options.recycleEnabled ? 0.96 : 0.85,
      },
      {
        width: 2,
        color: options.recycleEnabled ? 0x6fcf8a : 0x5b625a,
        alpha: 0.95,
      },
    );
    this.buttonLabel.style.fill = options.recycleEnabled ? 0xf1f6ef : 0x8e958c;
    this.buttonLabel.position.set(
      buttonX + buttonWidth / 2,
      buttonY + RECYCLE_BUTTON_HEIGHT / 2,
    );
  }

  public getPreferredSize(width: number): { width: number; height: number } {
    return { width, height: RECYCLE_PANEL_HEIGHT };
  }

  public containsPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.rect);
  }

  public isDropAtPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.dropRect);
  }

  public isButtonAtPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.buttonRect);
  }
}

export class HubModalView {
  public readonly container = new PIXI.Container();
  private readonly craftingModal: CraftingModal;
  private readonly recyclePanel = new RecyclePanelView();
  private readonly chestView: ChestView;

  constructor(options: {
    craftingStyles: CraftingModalStyles;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
  }) {
    this.craftingModal = new CraftingModal(options.craftingStyles);
    this.chestView = new ChestView({ iconProvider: options.iconProvider });
    this.container.addChild(
      this.craftingModal.container,
      this.recyclePanel.container,
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
    recycleIconProvider: (
      hotbarIndex: number,
    ) => { typeId: ResourceId; texture: PIXI.Texture } | null;
    recycleChestIconProvider: (
      chestIndex: number,
    ) => { typeId: ResourceId; texture: PIXI.Texture } | null;
  }): void {
    const chestSize = this.chestView.getPreferredSize();
    const recycleSize = this.recyclePanel.getPreferredSize(chestSize.width);
    const rightColumnHeight =
      recycleSize.height + HUB_COLUMN_GAP + chestSize.height;
    const dockStorageRight =
      options.craftingVisible &&
      options.storageVisible &&
      options.screenWidth >=
        chestSize.width +
          HUB_MIN_CRAFT_WIDTH +
          HUB_COLUMN_GAP +
          HUB_SCREEN_PADDING;
    const companionColumnWidth = dockStorageRight ? chestSize.width : null;

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
      height: dockStorageRight ? rightColumnHeight : null,
      visible: options.craftingVisible,
    });

    const craftingRect = options.craftingVisible
      ? this.craftingModal.getModalRect()
      : null;
    const recycleX = dockStorageRight
      ? (craftingRect?.x ?? 0) + (craftingRect?.width ?? 0) + HUB_COLUMN_GAP
      : Math.floor((options.screenWidth - chestSize.width) / 2);
    const recycleY = dockStorageRight
      ? (craftingRect?.y ?? 0)
      : options.craftingVisible && craftingRect
        ? craftingRect.y + craftingRect.height + HUB_COLUMN_GAP
        : Math.floor((options.screenHeight - rightColumnHeight) / 2);
    this.recyclePanel.sync({
      visible: options.storageVisible,
      x: recycleX,
      y: recycleY,
      width: chestSize.width,
      recycleHotbarIndex: options.recycleHotbarIndex,
      recycleChestIndex: options.recycleChestIndex,
      recycleItemLabel: options.recycleItemLabel,
      recycleEnabled: options.recycleEnabled,
      recycleDropHovered: options.recycleDropHovered,
      recycleIconProvider: options.recycleIconProvider,
      recycleChestIconProvider: options.recycleChestIconProvider,
    });

    const recycleRect = options.storageVisible
      ? {
          x: recycleX,
          y: recycleY,
          width: chestSize.width,
          height: RECYCLE_PANEL_HEIGHT,
        }
      : null;
    this.chestView.sync({
      visible: options.storageVisible,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      chestSlots: options.chestSlots,
      hotbarSlots: options.hotbarSlots,
      hoveredRef: options.hoveredChestRef,
      heldRef: options.heldChestRef,
      dockRightOfModal: null,
      stackBelowModal: recycleRect,
      recycleHotbarIndex: options.recycleHotbarIndex,
      recycleChestIndex: options.recycleChestIndex,
    });
  }

  public containsPoint(screenX: number, screenY: number): boolean {
    return (
      this.craftingModal.containsPoint(screenX, screenY) ||
      this.recyclePanel.containsPoint(screenX, screenY) ||
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
    return this.recyclePanel.isDropAtPoint(screenX, screenY);
  }

  public isRecycleButtonAtPoint(screenX: number, screenY: number): boolean {
    return this.recyclePanel.isButtonAtPoint(screenX, screenY);
  }

  public isCraftingTabsAtPoint(screenX: number, screenY: number): boolean {
    return this.craftingModal.isTabBarAtPoint(screenX, screenY);
  }

  public scrollCraftingTabsBy(deltaPx: number): boolean {
    return this.craftingModal.scrollTabsBy(deltaPx);
  }
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

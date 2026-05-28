import * as PIXI from "pixi.js";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { Rect } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySlotSnapshot } from "@shared/net/snapshots.ts";
import { CHEST_SLOT_COUNT } from "@shared/gameplay/constants.ts";
import { toHotbarSlotItems } from "@client/render/hud/hotbarModel.ts";

const CHEST_COLS = 10;
const CHEST_ROWS = 3;
const HOTBAR_SLOTS = 10;
const RECYCLE_SECTION_HEIGHT = 88;
const RECYCLE_BUTTON_HEIGHT = 44;

type SlotSource = "chest" | "hotbar";

class ChestSlotView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly icon = new PIXI.Sprite();
  private readonly countText: PIXI.Text;
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;
  private readonly size: number;

  constructor(options: {
    size: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    countStyle: PIXI.TextStyle;
  }) {
    this.size = options.size;
    this.iconProvider = options.iconProvider;
    this.countText = new PIXI.Text("", options.countStyle);
    this.icon.anchor.set(0.5);
    this.countText.anchor.set(1, 1);
    this.container.addChild(this.background, this.icon, this.countText);
  }

  public setLayout(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public render(options: {
    item: HotbarSlotItem;
    hovered: boolean;
    held: boolean;
  }): void {
    const { item, hovered, held } = options;
    const fill = held ? 0x2a2011 : hovered ? 0x1e2618 : 0x151a16;
    const border = held ? 0xf2c36a : hovered ? 0x81ba6d : 0x526151;

    this.background.clear();
    this.background
      .roundRect(0, 0, this.size, this.size, 8)
      .fill({ color: fill, alpha: 0.95 })
      .roundRect(0, 0, this.size, this.size, 8)
      .stroke({ width: held ? 3 : 2, color: border, alpha: 0.95 });

    if (!item.typeId) {
      this.icon.visible = false;
      this.countText.visible = false;
      return;
    }

    const iconSize = this.size - 14;
    this.icon.texture = this.iconProvider(item.typeId);
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(this.size / 2, this.size / 2 - 1);
    this.icon.visible = true;

    if (item.count !== null && (item.count > 1 || item.showCountWhenOne)) {
      this.countText.text = String(item.count);
      this.countText.position.set(this.size - 4, this.size - 4);
      this.countText.visible = true;
    } else {
      this.countText.visible = false;
    }
  }
}

export type ChestSlotRef = { source: SlotSource; index: number };

export class ChestView {
  public readonly container = new PIXI.Container();
  private readonly backdrop = new PIXI.Graphics();
  private readonly panel = new PIXI.Graphics();
  private readonly title: PIXI.Text;
  private readonly helper: PIXI.Text;
  private readonly sectionLabel: PIXI.Text;
  private readonly recycleSection: PIXI.Graphics;
  private readonly recycleTitle: PIXI.Text;
  private readonly recycleDrop: PIXI.Graphics;
  private readonly recycleIcon: PIXI.Sprite;
  private readonly recycleSlotLabel: PIXI.Text;
  private readonly recycleButton: PIXI.Graphics;
  private readonly recycleButtonLabel: PIXI.Text;
  private readonly chestSlotViews: ChestSlotView[] = [];
  private readonly hotbarSlotViews: ChestSlotView[] = [];
  private readonly chestSlotRects = new Map<number, Rect>();
  private readonly hotbarSlotRects = new Map<number, Rect>();
  private modalRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private recycleDropRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private recycleButtonRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private readonly slotSize = 52;
  private readonly gap = 6;
  private readonly padding = 20;

  constructor(options: { iconProvider: (typeId: ResourceId) => PIXI.Texture }) {
    const countStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 12,
      fill: 0xf3f6ee,
      stroke: { color: 0x0c120b, width: 3 },
    });

    this.title = new PIXI.Text(
      "Hub Storage",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 22,
        fill: 0xf1e8c8,
      }),
    );
    this.helper = new PIXI.Text(
      "Drag items between storage and hotbar  •  drag crafted output to hotbar",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 11,
        fill: 0xa6b79f,
      }),
    );
    this.sectionLabel = new PIXI.Text(
      "Hotbar",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 11,
        fill: 0x7a9470,
        letterSpacing: 0.8,
      }),
    );
    this.recycleSection = new PIXI.Graphics();
    this.recycleTitle = new PIXI.Text(
      "Recycle",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 11,
        fill: 0x8dcf9a,
        letterSpacing: 0.8,
      }),
    );
    this.recycleDrop = new PIXI.Graphics();
    this.recycleIcon = new PIXI.Sprite();
    this.recycleIcon.anchor.set(0.5);
    this.recycleSlotLabel = new PIXI.Text(
      "Drag an item here",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 13,
        fill: 0xe8f5e7,
      }),
    );
    this.recycleButton = new PIXI.Graphics();
    this.recycleButtonLabel = new PIXI.Text(
      "Recycle",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 13,
        fill: 0xf1f6ef,
      }),
    );
    this.recycleButtonLabel.anchor.set(0.5);

    this.container.addChild(
      this.backdrop,
      this.panel,
      this.title,
      this.helper,
      this.sectionLabel,
      this.recycleSection,
      this.recycleTitle,
      this.recycleDrop,
      this.recycleIcon,
      this.recycleSlotLabel,
      this.recycleButton,
      this.recycleButtonLabel,
    );

    for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
      const slot = new ChestSlotView({
        size: this.slotSize,
        iconProvider: options.iconProvider,
        countStyle,
      });
      this.chestSlotViews.push(slot);
      this.container.addChild(slot.container);
    }

    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = new ChestSlotView({
        size: this.slotSize,
        iconProvider: options.iconProvider,
        countStyle,
      });
      this.hotbarSlotViews.push(slot);
      this.container.addChild(slot.container);
    }
  }

  public sync(options: {
    visible: boolean;
    screenWidth: number;
    screenHeight: number;
    chestSlots: readonly InventorySlotSnapshot[];
    hotbarSlots: readonly InventorySlotSnapshot[];
    hoveredRef: ChestSlotRef | null;
    heldRef: ChestSlotRef | null;
    dockRightOfModal?: Rect | null;
    stackBelowModal?: Rect | null;
    recycleHotbarIndex: number | null;
    recycleItemLabel: string;
    recycleEnabled: boolean;
    recycleIconProvider: (hotbarIndex: number) => PIXI.Texture | null;
  }): void {
    const {
      visible,
      screenWidth,
      screenHeight,
      chestSlots,
      hotbarSlots,
      hoveredRef,
      heldRef,
      dockRightOfModal,
      stackBelowModal,
      recycleHotbarIndex,
      recycleItemLabel,
      recycleEnabled,
      recycleIconProvider,
    } = options;

    this.container.visible = visible;
    this.chestSlotRects.clear();
    this.hotbarSlotRects.clear();
    if (!visible) {
      this.modalRect = { x: 0, y: 0, width: 0, height: 0 };
      this.recycleDropRect = { x: 0, y: 0, width: 0, height: 0 };
      this.recycleButtonRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    const chestGridWidth =
      CHEST_COLS * this.slotSize + (CHEST_COLS - 1) * this.gap;
    const hotbarGridWidth =
      HOTBAR_SLOTS * this.slotSize + (HOTBAR_SLOTS - 1) * this.gap;
    const contentWidth = Math.max(chestGridWidth, hotbarGridWidth);
    const modalWidth = stackBelowModal
      ? stackBelowModal.width
      : contentWidth + this.padding * 2;

    const chestGridHeight =
      CHEST_ROWS * this.slotSize + (CHEST_ROWS - 1) * this.gap;
    const titleH = 52;
    const sectionLabelH = 20;
    const modalHeight =
      this.padding +
      titleH +
      chestGridHeight +
      this.gap * 3 +
      sectionLabelH +
      this.slotSize +
      this.gap * 3 +
      RECYCLE_SECTION_HEIGHT +
      this.padding;

    const modalX = stackBelowModal
      ? stackBelowModal.x
      : dockRightOfModal
        ? dockRightOfModal.x + dockRightOfModal.width + 14
        : Math.floor((screenWidth - modalWidth) / 2);
    const modalY = stackBelowModal
      ? stackBelowModal.y + stackBelowModal.height + 14
      : dockRightOfModal
        ? dockRightOfModal.y
        : Math.floor((screenHeight - modalHeight) / 2);
    this.container.position.set(modalX, modalY);
    this.modalRect = {
      x: modalX,
      y: modalY,
      width: modalWidth,
      height: modalHeight,
    };

    if (!dockRightOfModal && !stackBelowModal) {
      drawRoundedRect(
        this.backdrop,
        -12,
        -12,
        modalWidth + 24,
        modalHeight + 24,
        24,
        { color: 0x020402, alpha: 0.55 },
      );
    } else {
      this.backdrop.clear();
    }
    drawRoundedRect(
      this.panel,
      0,
      0,
      modalWidth,
      modalHeight,
      18,
      { color: 0x100d06, alpha: 0.96 },
      { width: 2, color: 0xc8912a, alpha: 0.45 },
    );

    this.title.position.set(this.padding, this.padding - 2);
    this.helper.position.set(this.padding, this.padding + 28);

    const chestOffsetX =
      this.padding + Math.floor((contentWidth - chestGridWidth) / 2);
    const chestStartY = this.padding + titleH;

    const chestItems = toHotbarSlotItems(chestSlots as InventorySlotSnapshot[]);
    for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
      const col = i % CHEST_COLS;
      const row = Math.floor(i / CHEST_COLS);
      const x = chestOffsetX + col * (this.slotSize + this.gap);
      const y = chestStartY + row * (this.slotSize + this.gap);
      this.chestSlotRects.set(i, {
        x: modalX + x,
        y: modalY + y,
        width: this.slotSize,
        height: this.slotSize,
      });
      const slot = this.chestSlotViews[i];
      if (slot) {
        slot.setLayout(x, y);
        slot.render({
          item: chestItems[i] ?? emptySlotItem(),
          hovered: hoveredRef?.source === "chest" && hoveredRef.index === i,
          held: heldRef?.source === "chest" && heldRef.index === i,
        });
      }
    }

    const sectionY = chestStartY + chestGridHeight + this.gap * 2;
    this.sectionLabel.position.set(this.padding, sectionY);

    const hotbarOffsetX =
      this.padding + Math.floor((contentWidth - hotbarGridWidth) / 2);
    const hotbarStartY = sectionY + sectionLabelH;

    const hotbarItems = toHotbarSlotItems(
      hotbarSlots as InventorySlotSnapshot[],
    );
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const x = hotbarOffsetX + i * (this.slotSize + this.gap);
      const y = hotbarStartY;
      this.hotbarSlotRects.set(i, {
        x: modalX + x,
        y: modalY + y,
        width: this.slotSize,
        height: this.slotSize,
      });
      const slot = this.hotbarSlotViews[i];
      if (slot) {
        slot.setLayout(x, y);
        slot.render({
          item: hotbarItems[i] ?? emptySlotItem(),
          hovered: hoveredRef?.source === "hotbar" && hoveredRef.index === i,
          held: heldRef?.source === "hotbar" && heldRef.index === i,
        });
      }
    }

    const recycleTop = hotbarStartY + this.slotSize + this.gap * 3;
    const recycleInnerX = this.padding;
    const recycleInnerWidth = modalWidth - this.padding * 2;
    drawRoundedRect(
      this.recycleSection,
      recycleInnerX,
      recycleTop,
      recycleInnerWidth,
      RECYCLE_SECTION_HEIGHT,
      12,
      { color: 0x101913, alpha: 0.9 },
      { width: 1, color: 0x3d8b5a, alpha: 0.65 },
    );
    this.recycleTitle.position.set(recycleInnerX + 12, recycleTop + 8);

    const dropSize = 48;
    const dropX = recycleInnerX + 12;
    const dropY = recycleTop + 30;
    this.recycleDropRect = {
      x: modalX + dropX,
      y: modalY + dropY,
      width: dropSize,
      height: dropSize,
    };
    drawRoundedRect(
      this.recycleDrop,
      dropX,
      dropY,
      dropSize,
      dropSize,
      10,
      { color: 0x17233a, alpha: 0.95 },
      {
        width: 2,
        color: recycleHotbarIndex !== null ? 0x6ea8ff : 0x4a5a72,
        alpha: 0.9,
      },
    );

    const recycleTexture =
      recycleHotbarIndex !== null
        ? recycleIconProvider(recycleHotbarIndex)
        : null;
    if (recycleTexture) {
      this.recycleIcon.texture = recycleTexture;
      this.recycleIcon.width = 34;
      this.recycleIcon.height = 34;
      this.recycleIcon.position.set(dropX + dropSize / 2, dropY + dropSize / 2);
      this.recycleIcon.visible = true;
      this.recycleSlotLabel.text = recycleItemLabel;
    } else {
      this.recycleIcon.visible = false;
      this.recycleSlotLabel.text = "Drag an item here";
    }
    this.recycleSlotLabel.position.set(dropX + dropSize + 12, dropY + 5);

    const recycleButtonWidth = 138;
    const recycleButtonX =
      recycleInnerX + recycleInnerWidth - recycleButtonWidth - 12;
    const recycleButtonY = dropY + 2;
    this.recycleButtonRect = {
      x: modalX + recycleButtonX,
      y: modalY + recycleButtonY,
      width: recycleButtonWidth,
      height: RECYCLE_BUTTON_HEIGHT,
    };
    drawRoundedRect(
      this.recycleButton,
      recycleButtonX,
      recycleButtonY,
      recycleButtonWidth,
      RECYCLE_BUTTON_HEIGHT,
      12,
      {
        color: recycleEnabled ? 0x24402f : 0x1a201b,
        alpha: recycleEnabled ? 0.96 : 0.85,
      },
      {
        width: 2,
        color: recycleEnabled ? 0x6fcf8a : 0x5b625a,
        alpha: 0.95,
      },
    );
    this.recycleButtonLabel.style.fill = recycleEnabled ? 0xf1f6ef : 0x8e958c;
    this.recycleButtonLabel.position.set(
      recycleButtonX + recycleButtonWidth / 2,
      recycleButtonY + RECYCLE_BUTTON_HEIGHT / 2,
    );
  }

  public getPreferredSize(): { width: number; height: number } {
    const chestGridWidth =
      CHEST_COLS * this.slotSize + (CHEST_COLS - 1) * this.gap;
    const hotbarGridWidth =
      HOTBAR_SLOTS * this.slotSize + (HOTBAR_SLOTS - 1) * this.gap;
    const chestGridHeight =
      CHEST_ROWS * this.slotSize + (CHEST_ROWS - 1) * this.gap;
    const titleH = 52;
    const sectionLabelH = 20;
    return {
      width: Math.max(chestGridWidth, hotbarGridWidth) + this.padding * 2,
      height:
        this.padding +
        titleH +
        chestGridHeight +
        this.gap * 3 +
        sectionLabelH +
        this.slotSize +
        this.gap * 3 +
        RECYCLE_SECTION_HEIGHT +
        this.padding,
    };
  }

  public isRecycleDropAtPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.recycleDropRect);
  }

  public isRecycleButtonAtPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.recycleButtonRect);
  }

  public containsPoint(screenX: number, screenY: number): boolean {
    return pointInRect(screenX, screenY, this.modalRect);
  }

  public getSlotRefAtPoint(
    screenX: number,
    screenY: number,
  ): ChestSlotRef | null {
    for (const [index, rect] of this.chestSlotRects) {
      if (pointInRect(screenX, screenY, rect)) {
        return { source: "chest", index };
      }
    }
    for (const [index, rect] of this.hotbarSlotRects) {
      if (pointInRect(screenX, screenY, rect)) {
        return { source: "hotbar", index };
      }
    }
    return null;
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

function emptySlotItem(): HotbarSlotItem {
  return {
    typeId: null,
    count: null,
    showCountWhenOne: false,
    ammoInMag: null,
    magSize: null,
    reserveMagCount: null,
    reloadTicksRemaining: null,
  };
}

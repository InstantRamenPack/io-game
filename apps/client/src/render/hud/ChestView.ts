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
  private readonly chestSlotViews: ChestSlotView[] = [];
  private readonly hotbarSlotViews: ChestSlotView[] = [];
  private readonly chestSlotRects = new Map<number, Rect>();
  private readonly hotbarSlotRects = new Map<number, Rect>();
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
      "Chest",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 22,
        fill: 0xf1e8c8,
      }),
    );
    this.helper = new PIXI.Text(
      "Drag items to transfer  •  E or Esc closes",
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

    this.container.addChild(
      this.backdrop,
      this.panel,
      this.title,
      this.helper,
      this.sectionLabel,
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
  }): void {
    const {
      visible,
      screenWidth,
      screenHeight,
      chestSlots,
      hotbarSlots,
      hoveredRef,
      heldRef,
    } = options;

    this.container.visible = visible;
    this.chestSlotRects.clear();
    this.hotbarSlotRects.clear();
    if (!visible) {
      return;
    }

    const chestGridWidth =
      CHEST_COLS * this.slotSize + (CHEST_COLS - 1) * this.gap;
    const hotbarGridWidth =
      HOTBAR_SLOTS * this.slotSize + (HOTBAR_SLOTS - 1) * this.gap;
    const contentWidth = Math.max(chestGridWidth, hotbarGridWidth);
    const modalWidth = contentWidth + this.padding * 2;

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
      this.padding;

    const modalX = Math.floor((screenWidth - modalWidth) / 2);
    const modalY = Math.floor((screenHeight - modalHeight) / 2);
    this.container.position.set(modalX, modalY);

    drawRoundedRect(
      this.backdrop,
      -12,
      -12,
      modalWidth + 24,
      modalHeight + 24,
      24,
      { color: 0x020402, alpha: 0.55 },
    );
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

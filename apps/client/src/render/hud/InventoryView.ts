import * as PIXI from "pixi.js";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { Rect } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

class InventorySlotView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly icon = new PIXI.Sprite();
  private readonly countText: PIXI.Text;
  private readonly shortcutText: PIXI.Text;
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;
  private readonly size: number;

  constructor(options: {
    size: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    countStyle: PIXI.TextStyle;
    shortcutStyle: PIXI.TextStyle;
  }) {
    this.size = options.size;
    this.iconProvider = options.iconProvider;
    this.countText = new PIXI.Text("", options.countStyle);
    this.shortcutText = new PIXI.Text("", options.shortcutStyle);

    this.icon.anchor.set(0.5);
    this.countText.anchor.set(1, 1);

    this.container.addChild(
      this.background,
      this.icon,
      this.countText,
      this.shortcutText,
    );
  }

  public setLayout(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public render(options: {
    item: HotbarSlotItem;
    active: boolean;
    hovered: boolean;
    held: boolean;
    shortcutLabel: string;
  }): void {
    const { item, active, hovered, held, shortcutLabel } = options;
    const fill = held ? 0x2a2011 : active ? 0x233321 : 0x151a16;
    const border = held
      ? 0xf2c36a
      : active
        ? 0xb7f08f
        : hovered
          ? 0x81ba6d
          : 0x526151;

    this.background.clear();
    this.background
      .roundRect(0, 0, this.size, this.size, 10)
      .fill({ color: fill, alpha: 0.95 })
      .roundRect(0, 0, this.size, this.size, 10)
      .stroke({ width: held ? 3 : 2, color: border, alpha: 0.95 })
      .roundRect(4, 4, this.size - 8, this.size - 8, 8)
      .stroke({ width: 1, color: 0x0f130f, alpha: 0.9 });

    this.shortcutText.text = shortcutLabel;
    this.shortcutText.position.set(6, 4);
    this.shortcutText.visible = shortcutLabel.length > 0;

    if (!item.typeId) {
      this.icon.visible = false;
      this.countText.visible = false;
      this.countText.text = "";
      return;
    }

    const iconSize = this.size - 18;
    this.icon.texture = this.iconProvider(item.typeId);
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(this.size / 2, this.size / 2 - 2);
    this.icon.visible = true;

    if (item.count !== null && (item.count > 1 || item.showCountWhenOne)) {
      this.countText.text = String(item.count);
      this.countText.position.set(this.size - 5, this.size - 5);
      this.countText.visible = true;
    } else {
      this.countText.visible = false;
      this.countText.text = "";
    }
  }
}

export class InventoryView {
  public readonly container = new PIXI.Container();
  private readonly backdrop = new PIXI.Graphics();
  private readonly panel = new PIXI.Graphics();
  private readonly title: PIXI.Text;
  private readonly helper: PIXI.Text;
  private readonly slots: InventorySlotView[] = [];
  private readonly slotRects = new Map<number, Rect>();
  private panelRect: Rect | null = null;
  private readonly slotSize = 64;
  private readonly gap = 10;
  private readonly padding = 20;

  constructor(options: { iconProvider: (typeId: ResourceId) => PIXI.Texture }) {
    const countStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 13,
      fill: 0xf3f6ee,
      stroke: { color: 0x0c120b, width: 3 },
    });
    const shortcutStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 10,
      fill: 0xa9ba9d,
      letterSpacing: 0.4,
    });

    this.title = new PIXI.Text(
      "Hotbar Layout",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 24,
        fill: 0xf1f7ee,
      }),
    );
    this.helper = new PIXI.Text(
      "Drag or click to swap slots, 1-0 send hovered slot to index, E closes",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 12,
        fill: 0xa6b79f,
      }),
    );

    this.container.addChild(this.backdrop, this.panel, this.title, this.helper);

    for (let index = 0; index < 10; index += 1) {
      const slot = new InventorySlotView({
        size: this.slotSize,
        iconProvider: options.iconProvider,
        countStyle,
        shortcutStyle,
      });
      this.slots.push(slot);
      this.container.addChild(slot.container);
    }
  }

  public sync(options: {
    visible: boolean;
    screenWidth: number;
    screenHeight: number;
    hotbarItems: HotbarSlotItem[];
    selectedHotbarIndex: number;
    hoveredSlotIndex: number | null;
    heldSlotIndex: number | null;
  }): void {
    const {
      visible,
      screenWidth,
      screenHeight,
      hotbarItems,
      selectedHotbarIndex,
      hoveredSlotIndex,
      heldSlotIndex,
    } = options;

    this.container.visible = visible;
    this.slotRects.clear();
    this.panelRect = null;
    if (!visible) {
      return;
    }

    const contentWidth = 10 * this.slotSize + 9 * this.gap;
    const modalWidth = contentWidth + this.padding * 2;
    const modalHeight = this.slotSize + this.padding * 2 + 72;
    const modalX = Math.floor((screenWidth - modalWidth) / 2);
    const modalY = Math.floor((screenHeight - modalHeight) / 2);
    this.panelRect = {
      x: modalX,
      y: modalY,
      width: modalWidth,
      height: modalHeight,
    };
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
      { color: 0x0a100b, alpha: 0.94 },
      { width: 2, color: 0x7fb56d, alpha: 0.35 },
    );

    this.title.position.set(this.padding, this.padding - 2);
    this.helper.position.set(this.padding, this.padding + 30);

    const slotY = this.padding + 64;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (!slot) {
        continue;
      }
      const x = this.padding + index * (this.slotSize + this.gap);
      this.slotRects.set(index, {
        x: modalX + x,
        y: modalY + slotY,
        width: this.slotSize,
        height: this.slotSize,
      });
      slot.setLayout(x, slotY);
      slot.render({
        item: hotbarItems[index] ?? emptySlotItem(),
        active: selectedHotbarIndex === index,
        hovered: hoveredSlotIndex === index,
        held: heldSlotIndex === index,
        shortcutLabel: String((index + 1) % 10),
      });
    }
  }

  public getSlotIndexAtPoint(screenX: number, screenY: number): number | null {
    for (const [slotIndex, rect] of this.slotRects) {
      if (
        screenX >= rect.x &&
        screenX <= rect.x + rect.width &&
        screenY >= rect.y &&
        screenY <= rect.y + rect.height
      ) {
        return slotIndex;
      }
    }
    return null;
  }

  public getSlotRect(slotIndex: number): Rect | null {
    return this.slotRects.get(slotIndex) ?? null;
  }

  public getPanelRect(): Rect | null {
    return this.panelRect;
  }
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

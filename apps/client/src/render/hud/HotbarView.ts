import * as PIXI from "pixijs";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type HotbarSlotItem = {
  typeId: ResourceId | null;
  count: number | null;
  showCountWhenOne: boolean;
  ammoFillRatio: number | null;
};

class HotbarSlotView {
  public readonly container: PIXI.Container;
  private readonly base: PIXI.Graphics;
  private readonly activeOutline: PIXI.Graphics;
  private readonly icon: PIXI.Sprite;
  private readonly ammoBarTrack: PIXI.Graphics;
  private readonly ammoBarFill: PIXI.Graphics;
  private readonly countText: PIXI.Text;
  private readonly shortcutText: PIXI.Text;
  private readonly slotSize: number;
  private readonly iconPadding: number;
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;

  constructor(options: {
    slotSize: number;
    iconPadding: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    countStyle: PIXI.TextStyle;
    shortcutStyle: PIXI.TextStyle;
  }) {
    this.slotSize = options.slotSize;
    this.iconPadding = options.iconPadding;
    this.iconProvider = options.iconProvider;

    this.container = new PIXI.Container();
    this.base = new PIXI.Graphics();
    this.activeOutline = new PIXI.Graphics();
    this.icon = new PIXI.Sprite();
    this.icon.anchor.set(0.5);
    this.ammoBarTrack = new PIXI.Graphics();
    this.ammoBarFill = new PIXI.Graphics();
    this.countText = new PIXI.Text("", options.countStyle);
    this.countText.anchor.set(1, 1);
    this.shortcutText = new PIXI.Text("", options.shortcutStyle);

    this.container.addChild(this.base);
    this.container.addChild(this.activeOutline);
    this.container.addChild(this.icon);
    this.container.addChild(this.ammoBarTrack);
    this.container.addChild(this.ammoBarFill);
    this.container.addChild(this.countText);
    this.container.addChild(this.shortcutText);

    this.drawBase(false);
    this.setActive(false);
    this.clearItem();
  }

  public setShortcutLabel(label: string): void {
    this.shortcutText.text = label;
    this.shortcutText.position.set(4, 2);
  }

  public setActive(active: boolean): void {
    this.activeOutline.visible = active;
    if (active) {
      const inflate = 4;
      const size = this.slotSize + inflate * 2;
      this.activeOutline.clear();
      this.activeOutline.lineStyle(2.5, 0xf7f7f7, 0.95);
      this.activeOutline.beginFill(0x4a4a4a, 0.25);
      this.activeOutline.drawRoundedRect(-inflate, -inflate, size, size, 5);
      this.activeOutline.endFill();
    } else {
      this.activeOutline.clear();
    }

    this.drawBase(active);
  }

  public setItem(item: HotbarSlotItem): void {
    if (!item.typeId) {
      this.clearItem();
      return;
    }

    this.icon.texture = this.iconProvider(item.typeId);
    const iconSize = this.slotSize - this.iconPadding * 2;
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(this.slotSize / 2, this.slotSize / 2 + 2);
    this.icon.visible = true;

    if (item.count !== null && (item.count > 1 || item.showCountWhenOne)) {
      this.countText.text = String(item.count);
      this.countText.position.set(this.slotSize - 4, this.slotSize - 2);
      this.countText.visible = true;
    } else {
      this.countText.text = "";
      this.countText.visible = false;
    }

    this.drawAmmoBar(item.ammoFillRatio);
  }

  public clearItem(): void {
    this.icon.visible = false;
    this.countText.text = "";
    this.countText.visible = false;
    this.ammoBarTrack.clear();
    this.ammoBarTrack.visible = false;
    this.ammoBarFill.clear();
    this.ammoBarFill.visible = false;
  }

  private drawBase(active: boolean): void {
    this.base.clear();
    const fill = active ? 0x3a3a3a : 0x262626;
    const edge = active ? 0xf0f0f0 : 0x8e8e8e;
    const inner = active ? 0x5b5b5b : 0x3a3a3a;

    this.base.lineStyle(2, edge, 0.9);
    this.base.beginFill(fill, 0.92);
    this.base.drawRoundedRect(0, 0, this.slotSize, this.slotSize, 4);
    this.base.endFill();

    this.base.lineStyle(1, inner, 0.85);
    this.base.drawRoundedRect(2, 2, this.slotSize - 4, this.slotSize - 4, 3);
  }

  private drawAmmoBar(fillRatio: number | null): void {
    this.ammoBarTrack.clear();
    this.ammoBarFill.clear();

    if (fillRatio === null) {
      this.ammoBarTrack.visible = false;
      this.ammoBarFill.visible = false;
      return;
    }

    const clampedRatio = Math.max(0, Math.min(1, fillRatio));
    const barX = 6;
    const barY = this.slotSize - 9;
    const barWidth = this.slotSize - 12;
    const barHeight = 5;

    this.ammoBarTrack.visible = true;
    this.ammoBarTrack.beginFill(0x1b1b1b, 0.85);
    this.ammoBarTrack.drawRoundedRect(barX, barY, barWidth, barHeight, 3);
    this.ammoBarTrack.endFill();

    this.ammoBarFill.visible = true;
    if (clampedRatio > 0) {
      this.ammoBarFill.beginFill(0xff9c31, 0.98);
      this.ammoBarFill.drawRoundedRect(
        barX,
        barY,
        barWidth * clampedRatio,
        barHeight,
        3,
      );
      this.ammoBarFill.endFill();
    }
  }
}

export class HotbarView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly slots: HotbarSlotView[] = [];
  private readonly slotSize = 40;
  private readonly slotGap = 6;
  private readonly padding = 8;
  private readonly iconPadding = 5;
  private widthValue = 0;
  private heightValue = 0;

  constructor(options: {
    slotCount: number;
    shortcutLabels: readonly string[];
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
  }) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.container.addChild(this.background);

    const countStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 13,
      fill: 0xf3f6ee,
      dropShadow: true,
      dropShadowColor: 0x0a0f09,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
      stroke: 0x0c120b,
      strokeThickness: 3,
    });
    const shortcutStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 11,
      fill: 0xb8c3b6,
      letterSpacing: 0.4,
    });

    for (let index = 0; index < options.slotCount; index += 1) {
      const slot = new HotbarSlotView({
        slotSize: this.slotSize,
        iconPadding: this.iconPadding,
        iconProvider: options.iconProvider,
        countStyle,
        shortcutStyle,
      });
      slot.setShortcutLabel(options.shortcutLabels[index] ?? "");
      slot.container.position.set(
        this.padding + index * (this.slotSize + this.slotGap),
        this.padding,
      );
      this.slots.push(slot);
      this.container.addChild(slot.container);
    }

    this.layoutBackground(options.slotCount);
  }

  public setSlots(items: HotbarSlotItem[], activeIndex: number | null): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      const item = items[index];
      slot.setActive(activeIndex === index);
      if (item && item.typeId) {
        slot.setItem(item);
      } else {
        slot.clearItem();
      }
    }
  }

  public setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public get width(): number {
    return this.widthValue;
  }

  public get height(): number {
    return this.heightValue;
  }

  private layoutBackground(slotCount: number): void {
    const width =
      this.padding * 2 +
      slotCount * this.slotSize +
      (slotCount - 1) * this.slotGap;
    const height = this.padding * 2 + this.slotSize;
    this.widthValue = Math.ceil(width);
    this.heightValue = Math.ceil(height);

    this.background.clear();
    this.background.lineStyle(2, 0x4b4b4b, 0.7);
    this.background.beginFill(0x151515, 0.78);
    this.background.drawRoundedRect(0, 0, width, height, 6);
    this.background.endFill();

    this.background.lineStyle(1, 0x2a2a2a, 0.85);
    this.background.drawRoundedRect(2, 2, width - 4, height - 4, 5);
  }
}

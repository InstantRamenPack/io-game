import * as PIXI from "pixi.js";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { syncItemIconSprite } from "@client/render/hud/itemIconRendering.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type HotbarSlotItem = {
  typeId: ResourceId | null;
  count: number | null;
  showCountWhenOne: boolean;
  ammoInMag: number | null;
  magSize: number | null;
  reserveMagCount: number | null;
  reloadTicksRemaining: number | null;
};

class HotbarSlotView {
  public readonly container: PIXI.Container;
  private readonly base: PIXI.Graphics;
  private readonly activeOutline: PIXI.Graphics;
  private readonly icon: PIXI.Sprite;
  private readonly countText: PIXI.Text;
  private readonly shortcutText: PIXI.Text;
  private readonly ammoBarTrack: PIXI.Graphics;
  private readonly ammoBarFill: PIXI.Graphics;
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
    this.countText = new PIXI.Text({ text: "", style: options.countStyle });
    this.countText.anchor.set(1, 1);
    this.shortcutText = new PIXI.Text({
      text: "",
      style: options.shortcutStyle,
    });
    this.ammoBarTrack = new PIXI.Graphics();
    this.ammoBarFill = new PIXI.Graphics();

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
      drawRoundedRect(
        this.activeOutline,
        -inflate,
        -inflate,
        size,
        size,
        5,
        { color: 0x4a4a4a, alpha: 0.25 },
        { width: 2.5, color: 0xf7f7f7, alpha: 0.95 },
      );
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

    syncItemIconSprite({
      sprite: this.icon,
      typeId: item.typeId,
      texture: this.iconProvider(item.typeId),
      boxSize: this.slotSize,
      centerX: this.slotSize / 2,
      centerY: this.slotSize / 2 + 2,
      padding: this.iconPadding,
    });

    if (item.count !== null && (item.count > 1 || item.showCountWhenOne)) {
      this.countText.text = String(item.count);
      this.countText.position.set(this.slotSize - 4, this.slotSize - 2);
      this.countText.visible = true;
    } else {
      this.countText.text = "";
      this.countText.visible = false;
    }

    this.updateAmmoBar(item);
  }

  public clearItem(): void {
    this.icon.visible = false;
    this.countText.text = "";
    this.countText.visible = false;
    this.ammoBarTrack.visible = false;
    this.ammoBarFill.visible = false;
  }

  private drawBase(active: boolean): void {
    const fill = active ? 0x3a3a3a : 0x262626;
    const edge = active ? 0xf0f0f0 : 0x8e8e8e;
    const inner = active ? 0x5b5b5b : 0x3a3a3a;

    this.base.clear();
    this.base
      .roundRect(0, 0, this.slotSize, this.slotSize, 4)
      .fill({ color: fill, alpha: 0.92 })
      .roundRect(0, 0, this.slotSize, this.slotSize, 4)
      .stroke({ width: 2, color: edge, alpha: 0.9 })
      .roundRect(2, 2, this.slotSize - 4, this.slotSize - 4, 3)
      .stroke({ width: 1, color: inner, alpha: 0.85 });
  }

  private updateAmmoBar(item: HotbarSlotItem): void {
    if (typeof item.magSize !== "number" || item.magSize <= 0) {
      this.ammoBarTrack.visible = false;
      this.ammoBarFill.visible = false;
      return;
    }

    const trackWidth = this.slotSize - 8;
    const trackHeight = 4;
    const x = 4;
    const y = this.slotSize - 7;

    drawRoundedRect(this.ammoBarTrack, x, y, trackWidth, trackHeight, 2, {
      color: 0x1f1f1f,
      alpha: 0.95,
    });
    this.ammoBarTrack.visible = true;

    const reloadTicksRemaining =
      typeof item.reloadTicksRemaining === "number" &&
      item.reloadTicksRemaining > 0
        ? item.reloadTicksRemaining
        : null;
    const weaponContent =
      item.typeId !== null ? getWeaponContent(item.typeId) : undefined;
    const reloadTicks =
      weaponContent?.attackStyle === "shoot" ? weaponContent.reloadTicks : null;
    let fillRatio = 0;
    if (
      reloadTicksRemaining !== null &&
      typeof reloadTicks === "number" &&
      reloadTicks > 0
    ) {
      fillRatio = 1 - reloadTicksRemaining / reloadTicks;
    } else if (typeof item.ammoInMag === "number") {
      fillRatio = item.ammoInMag / item.magSize;
    }

    const clamped = Math.min(1, Math.max(0, fillRatio));
    const fillWidth = Math.floor(trackWidth * clamped);
    if (fillWidth > 0) {
      drawRoundedRect(this.ammoBarFill, x, y, fillWidth, trackHeight, 2, {
        color: 0xff9f1a,
        alpha: 1,
      });
      this.ammoBarFill.visible = true;
    } else {
      this.ammoBarFill.clear();
      this.ammoBarFill.visible = false;
    }
  }
}

export class HotbarView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly slots: HotbarSlotView[] = [];
  private readonly slotSize = 52;
  private readonly slotGap = 6;
  private readonly padding = 8;
  private readonly iconPadding = 4;
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
      dropShadow: {
        color: 0x0a0f09,
        blur: 2,
        distance: 1,
      },
      stroke: { color: 0x0c120b, width: 3 },
    });
    const shortcutStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 11,
      fill: 0xb8c3b6,
      letterSpacing: 0.4,
    });

    const mainOffsetX = this.padding;
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
        mainOffsetX + index * (this.slotSize + this.slotGap),
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
      if (!slot) {
        continue;
      }
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
    this.background
      .roundRect(0, 0, width, height, 6)
      .fill({ color: 0x151515, alpha: 0.78 })
      .roundRect(0, 0, width, height, 6)
      .stroke({ width: 2, color: 0x4b4b4b, alpha: 0.7 })
      .roundRect(2, 2, width - 4, height - 4, 5)
      .stroke({ width: 1, color: 0x2a2a2a, alpha: 0.85 });
  }
}

import * as PIXI from "pixi.js";
import type { HudEffectEntry } from "@client/render/hud/hudPresentationModels.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

class EffectIconCell {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly icon = new PIXI.Sprite();

  constructor() {
    this.icon.anchor.set(0.5);
    this.container.addChild(this.background, this.icon);
  }

  public setLayout(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public render(texture: PIXI.Texture): void {
    drawRoundedRect(
      this.background,
      0,
      0,
      28,
      28,
      7,
      { color: 0x101513, alpha: 0.85 },
      { width: 1, color: 0xc0d4b7, alpha: 0.45 },
    );

    this.icon.texture = texture;
    this.icon.width = 18;
    this.icon.height = 18;
    this.icon.position.set(14, 14);
  }
}

export class EffectIconView {
  public readonly container = new PIXI.Container();
  private readonly cells: EffectIconCell[] = [];
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;
  private widthValue = 0;
  private heightValue = 0;

  constructor(options: { iconProvider: (typeId: ResourceId) => PIXI.Texture }) {
    this.iconProvider = options.iconProvider;
  }

  public sync(entries: HudEffectEntry[]): void {
    this.widthValue = entries.length > 0 ? 28 : 0;
    this.heightValue = entries.length > 0 ? entries.length * 34 - 6 : 0;
    this.container.visible = entries.length > 0;
    while (this.cells.length < entries.length) {
      const cell = new EffectIconCell();
      this.cells.push(cell);
      this.container.addChild(cell.container);
    }

    for (let index = 0; index < this.cells.length; index += 1) {
      const cell = this.cells[index];
      const entry = entries[index];
      if (!cell) {
        continue;
      }
      cell.container.visible = Boolean(entry);
      if (!entry) {
        continue;
      }
      cell.setLayout(0, index * 34);
      cell.render(this.iconProvider(entry.typeId));
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
}

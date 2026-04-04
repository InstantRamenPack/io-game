import * as PIXI from "pixijs";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

type ResourceStackEntry = {
  typeId: ResourceId;
  count: number;
};

class ResourceCircleView {
  public readonly container = new PIXI.Container();
  private readonly circle = new PIXI.Graphics();
  private readonly icon = new PIXI.Sprite();
  private readonly countText: PIXI.Text;
  private readonly typeText: PIXI.Text;
  private readonly size: number;
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;

  constructor(options: {
    size: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    countStyle: PIXI.TextStyle;
    labelStyle: PIXI.TextStyle;
  }) {
    this.size = options.size;
    this.iconProvider = options.iconProvider;
    this.countText = new PIXI.Text("", options.countStyle);
    this.typeText = new PIXI.Text("", options.labelStyle);

    this.icon.anchor.set(0.5);
    this.countText.anchor.set(0.5);
    this.typeText.anchor.set(0, 0.5);

    this.container.addChild(
      this.circle,
      this.icon,
      this.countText,
      this.typeText,
    );
  }

  public setLayout(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public render(entry: ResourceStackEntry): void {
    this.circle.clear();
    this.circle.lineStyle(2, entry.count > 0 ? 0x82ec4f : 0x5f6f5d, 0.9);
    this.circle.beginFill(entry.count > 0 ? 0x102014 : 0x0b0f0c, 0.95);
    this.circle.drawCircle(this.size / 2, this.size / 2, this.size / 2);
    this.circle.endFill();

    const iconSize = this.size - 18;
    this.icon.texture = this.iconProvider(entry.typeId);
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(this.size / 2, this.size / 2);
    this.icon.alpha = entry.count > 0 ? 1 : 0.45;

    this.countText.text = String(entry.count);
    this.countText.position.set(this.size / 2, this.size - 10);
    this.typeText.text = entry.typeId.split(":")[1] ?? entry.typeId;
    this.typeText.position.set(this.size + 10, this.size / 2);
    this.typeText.visible = false;
  }
}

export class ResourceStackView {
  public readonly container = new PIXI.Container();
  private readonly views: ResourceCircleView[] = [];
  private widthValue = 0;
  private heightValue = 0;
  private readonly circleSize = 52;
  private readonly gap = 10;

  constructor(options: { iconProvider: (typeId: ResourceId) => PIXI.Texture }) {
    for (let index = 0; index < 24; index += 1) {
      const view = new ResourceCircleView({
        size: this.circleSize,
        iconProvider: options.iconProvider,
        countStyle: new PIXI.TextStyle({
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 12,
          fill: 0xf4f8ef,
          stroke: 0x0c120b,
          strokeThickness: 3,
        }),
        labelStyle: new PIXI.TextStyle({
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 11,
          fill: 0xa7b89f,
        }),
      });
      this.views.push(view);
      this.container.addChild(view.container);
    }
  }

  public sync(entries: ResourceStackEntry[]): void {
    const visibleEntries = entries.slice(0, this.views.length);
    for (let index = 0; index < this.views.length; index += 1) {
      const view = this.views[index];
      const entry = visibleEntries[index];
      if (!view) {
        continue;
      }
      view.container.visible = Boolean(entry);
      if (!entry) {
        continue;
      }
      const y = index * (this.circleSize + this.gap);
      view.setLayout(0, y);
      view.render(entry);
    }

    this.widthValue = this.circleSize;
    this.heightValue =
      visibleEntries.length > 0
        ? visibleEntries.length * this.circleSize +
          (visibleEntries.length - 1) * this.gap
        : 0;
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

import * as PIXI from "pixi.js";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { TextStyleOptions } from "@client/render/renderTypes.ts";

type PanelLayout = {
  minWidth?: number;
  maxWidth?: number;
};

export class HudPanel {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly titleText: PIXI.Text;
  private readonly bodyText: PIXI.Text;
  private readonly padding = 12;
  private readonly gap = 6;
  private widthValue = 0;
  private heightValue = 0;

  constructor(titleStyle: TextStyleOptions, bodyStyle: TextStyleOptions) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.titleText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle(titleStyle),
    });
    this.bodyText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle(bodyStyle),
    });
    this.container.addChild(this.background);
    this.container.addChild(this.titleText);
    this.container.addChild(this.bodyText);
  }

  public setContent(
    title: string,
    body: string,
    { minWidth, maxWidth }: PanelLayout = {},
  ): void {
    this.titleText.text = title;
    this.bodyText.text = body;

    const wrapWidth =
      typeof maxWidth === "number"
        ? Math.max(0, maxWidth - this.padding * 2)
        : null;
    this.bodyText.style.wordWrap = wrapWidth !== null;
    this.bodyText.style.wordWrapWidth = wrapWidth ?? 0;

    const contentWidth = Math.max(
      this.titleText.width,
      this.bodyText.width,
      minWidth ?? 0,
    );

    this.widthValue = Math.ceil(contentWidth + this.padding * 2);
    this.heightValue = Math.ceil(
      this.padding * 2 +
        this.titleText.height +
        this.gap +
        this.bodyText.height,
    );

    drawRoundedRect(
      this.background,
      0,
      0,
      this.widthValue,
      this.heightValue,
      12,
      { color: 0x0a120b, alpha: 0.78 },
      { width: 1, color: 0x90c87a, alpha: 0.2 },
    );

    this.titleText.position.set(this.padding, this.padding);
    this.bodyText.position.set(
      this.padding,
      this.padding + this.titleText.height + this.gap,
    );
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

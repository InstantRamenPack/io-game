import * as PIXI from "pixi.js";
import type { HudTooltipContent } from "@client/render/hud/hudPresentationModels.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";

export class HudTooltipView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly title: PIXI.Text;
  private readonly detail: PIXI.Text;
  private readonly lines: PIXI.Text;
  private widthValue = 0;
  private heightValue = 0;

  constructor() {
    this.title = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 14,
        fill: 0xf3f6ee,
      }),
    );
    this.detail = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 12,
        fill: 0xd5dfcf,
        wordWrap: true,
      }),
    );
    this.lines = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 12,
        fill: 0xb2c0ab,
        wordWrap: true,
      }),
    );
    this.container.addChild(
      this.background,
      this.title,
      this.detail,
      this.lines,
    );
    this.container.visible = false;
  }

  public sync(content: HudTooltipContent | null, maxWidth = 260): void {
    this.container.visible = Boolean(content);
    if (!content) {
      this.widthValue = 0;
      this.heightValue = 0;
      return;
    }

    const padding = 10;
    const detailWidth = Math.max(80, maxWidth - padding * 2);
    this.title.text = content.title;
    this.detail.text = content.detail;
    this.detail.style.wordWrapWidth = detailWidth;
    this.lines.text = content.lines.join("\n");
    this.lines.style.wordWrapWidth = detailWidth;

    const contentWidth = Math.max(
      this.title.width,
      this.detail.width,
      this.lines.width,
    );
    this.widthValue = Math.ceil(contentWidth + padding * 2);
    this.heightValue = Math.ceil(
      padding * 2 +
        this.title.height +
        6 +
        this.detail.height +
        (content.lines.length > 0 ? 8 + this.lines.height : 0),
    );

    drawRoundedRect(
      this.background,
      0,
      0,
      this.widthValue,
      this.heightValue,
      10,
      { color: 0x090d0a, alpha: 0.94 },
      { width: 1, color: 0x9dc18d, alpha: 0.45 },
    );

    this.title.position.set(padding, padding);
    this.detail.position.set(padding, padding + this.title.height + 6);
    this.lines.position.set(
      padding,
      this.detail.y + this.detail.height + (content.lines.length > 0 ? 8 : 0),
    );
    this.lines.visible = content.lines.length > 0;
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

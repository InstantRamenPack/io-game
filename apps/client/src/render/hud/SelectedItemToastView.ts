import * as PIXI from "pixi.js";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";

export class SelectedItemToastView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly text: PIXI.Text;
  private widthValue = 0;
  private heightValue = 0;

  constructor() {
    this.text = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 16,
        fill: 0xf3f6ee,
        stroke: { color: 0x0c120b, width: 3 },
      }),
    );
    this.text.anchor.set(0.5);
    this.container.addChild(this.background, this.text);
    this.container.visible = false;
  }

  public sync(label: string | null, alpha: number, textColor = 0xf3f6ee): void {
    this.container.visible = Boolean(label) && alpha > 0;
    if (!label || alpha <= 0) {
      this.widthValue = 0;
      this.heightValue = 0;
      return;
    }

    const paddingX = 14;
    const paddingY = 8;
    this.text.text = label;
    this.text.style.fill = textColor;
    this.widthValue = Math.ceil(this.text.width + paddingX * 2);
    this.heightValue = Math.ceil(this.text.height + paddingY * 2);

    drawRoundedRect(
      this.background,
      0,
      0,
      this.widthValue,
      this.heightValue,
      Math.floor(this.heightValue / 2),
      { color: 0x2a2f35, alpha: 0.92 * alpha },
      { width: 1, color: 0x89929b, alpha: 0.65 * alpha },
    );

    this.text.position.set(this.widthValue / 2, this.heightValue / 2);
    this.container.alpha = alpha;
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

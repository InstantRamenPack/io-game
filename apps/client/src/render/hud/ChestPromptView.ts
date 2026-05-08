import * as PIXI from "pixi.js";

const PANEL_WIDTH = 240;

export class ChestPromptView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly promptText: PIXI.Text;

  constructor() {
    this.container = new PIXI.Container();

    this.background = new PIXI.Graphics();
    this.container.addChild(this.background);

    this.promptText = new PIXI.Text({
      text: "Press E to open chest",
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 14,
        fill: 0xe8f5e7,
        align: "center",
      },
    });
    this.promptText.anchor.set(0.5, 0.5);
    this.container.addChild(this.promptText);

    this.container.visible = false;
  }

  public sync(options: {
    visible: boolean;
    screenWidth: number;
    screenHeight: number;
  }): void {
    const { visible, screenWidth, screenHeight } = options;

    this.container.visible = visible;
    if (!visible) {
      return;
    }

    const panelHeight = 40;
    const panelX = screenWidth / 2 - PANEL_WIDTH / 2;
    const panelY = screenHeight - 180;

    this.background.clear();
    this.background
      .roundRect(0, 0, PANEL_WIDTH, panelHeight, 8)
      .fill({ color: 0x0d1a0d, alpha: 0.85 })
      .stroke({ width: 1, color: 0x3d8b37, alpha: 0.9 });
    this.container.position.set(panelX, panelY);

    this.promptText.position.set(PANEL_WIDTH / 2, panelHeight / 2);
  }

  public destroy(): void {
    this.background.destroy();
    this.promptText.destroy();
    this.container.destroy();
  }
}

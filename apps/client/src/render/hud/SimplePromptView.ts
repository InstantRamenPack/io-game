import * as PIXI from "pixi.js";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 44;
const RADIUS = 22;

export const SIMPLE_PROMPT_HEIGHT = PANEL_HEIGHT;

export class SimplePromptView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly promptText: PIXI.Text;

  constructor(initialText: string) {
    this.promptText = new PIXI.Text({
      text: initialText,
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 14,
        fill: 0xe6ecf3,
        align: "center",
      },
    });
    this.promptText.anchor.set(0.5, 0.5);
    this.container.addChild(this.background, this.promptText);
    this.container.visible = false;
  }

  public sync(options: {
    visible: boolean;
    text: string;
    screenWidth: number;
    screenHeight: number;
    anchorBottomY?: number;
  }): void {
    const { visible, text, screenWidth, screenHeight, anchorBottomY } = options;
    this.container.visible = visible;
    if (!visible) return;

    const panelX = screenWidth / 2 - PANEL_WIDTH / 2;
    const panelY = Math.max(
      12,
      (anchorBottomY ?? screenHeight - 220 + PANEL_HEIGHT) - PANEL_HEIGHT,
    );
    this.container.position.set(panelX, panelY);

    this.background.clear();
    this.background
      .roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, RADIUS)
      .fill({ color: 0x2a2f35, alpha: 0.92 });
    this.background
      .roundRect(3, 3, PANEL_WIDTH - 6, PANEL_HEIGHT - 6, RADIUS - 3)
      .stroke({ width: 2, color: 0x9098a1, alpha: 0.7, alignment: 1 });

    this.promptText.text = text;
    this.promptText.position.set(PANEL_WIDTH / 2, PANEL_HEIGHT / 2);
  }
}

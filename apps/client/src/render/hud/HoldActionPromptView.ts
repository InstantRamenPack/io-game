import * as PIXI from "pixi.js";
import { INTERACT_HOLD_DURATION_MS } from "@shared/gameplay/constants.ts";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 27;
export const HOLD_PROMPT_HEIGHT = PANEL_HEIGHT;
const RADIUS = 12;
const TEXT_Y = PANEL_HEIGHT / 2;

export class HoldActionPromptView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly progressFill = new PIXI.Graphics();
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
    this.container.addChild(
      this.background,
      this.progressFill,
      this.promptText,
    );
    this.container.visible = false;
  }

  public sync(options: {
    visible: boolean;
    text: string;
    holdStartMs: number | null;
    nowMs: number;
    screenWidth: number;
    screenHeight: number;
    anchorBottomY?: number;
    canProgress?: boolean;
  }): void {
    const {
      visible,
      text,
      holdStartMs,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
      canProgress,
    } = options;
    this.container.visible = visible;
    if (!visible) return;

    const isHolding = holdStartMs !== null && canProgress !== false;
    const progress = isHolding
      ? Math.min(1, (nowMs - holdStartMs) / INTERACT_HOLD_DURATION_MS)
      : 0;

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

    this.progressFill.clear();
    if (progress > 0) {
      const fillW = Math.max(RADIUS * 2, PANEL_WIDTH * progress);
      this.progressFill
        .roundRect(0, 0, fillW, PANEL_HEIGHT, RADIUS)
        .fill({ color: 0x2f8a53, alpha: 0.82 });
    }

    this.promptText.text = text;
    this.promptText.position.set(PANEL_WIDTH / 2, TEXT_Y);
  }
}

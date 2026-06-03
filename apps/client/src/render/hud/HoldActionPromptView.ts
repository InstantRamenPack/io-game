import * as PIXI from "pixi.js";
import { INTERACT_HOLD_DURATION_MS } from "@shared/gameplay/constants.ts";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 54;
export const HOLD_PROMPT_HEIGHT = PANEL_HEIGHT;
const RADIUS = 12;
const BAR_PADDING_X = 14;
const BAR_Y = 11;
const BAR_HEIGHT = 9;
const BAR_RADIUS = 4.5;
const TEXT_Y = 39;

export class HoldActionPromptView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly progressBarBg = new PIXI.Graphics();
  private readonly progressBarFill = new PIXI.Graphics();
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
      this.progressBarBg,
      this.progressBarFill,
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

    const barX = BAR_PADDING_X;
    const barMaxW = PANEL_WIDTH - BAR_PADDING_X * 2;

    this.progressBarBg.clear();
    this.progressBarBg
      .roundRect(barX, BAR_Y, barMaxW, BAR_HEIGHT, BAR_RADIUS)
      .fill({ color: 0x383e47, alpha: 1 });

    this.progressBarFill.clear();
    if (progress > 0) {
      const fillW = Math.max(BAR_RADIUS * 2, barMaxW * progress);
      this.progressBarFill
        .roundRect(barX, BAR_Y, fillW, BAR_HEIGHT, BAR_RADIUS)
        .fill({ color: 0x4ade80, alpha: 1 });
    }

    this.promptText.text = text;
    this.promptText.position.set(PANEL_WIDTH / 2, TEXT_Y);
  }
}

import * as PIXI from "pixi.js";
import { INTERACT_HOLD_DURATION_MS } from "@shared/gameplay/constants.ts";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 44;
const RADIUS = 22;
const OUTLINE_INSET = 3;
const OUTLINE_WIDTH = 2;
const OUTLINE_ACTIVE_WIDTH = 4;

export class HoldActionPromptView {
  public readonly container = new PIXI.Container();
  private readonly background = new PIXI.Graphics();
  private readonly promptText: PIXI.Text;
  private readonly outlineBase = new PIXI.Graphics();
  private readonly outlineProgress = new PIXI.Graphics();

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
      this.outlineBase,
      this.outlineProgress,
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

    this.outlineBase.clear();
    this.outlineBase
      .roundRect(
        OUTLINE_INSET,
        OUTLINE_INSET,
        PANEL_WIDTH - OUTLINE_INSET * 2,
        PANEL_HEIGHT - OUTLINE_INSET * 2,
        RADIUS - OUTLINE_INSET,
      )
      .stroke({
        width: OUTLINE_WIDTH,
        color: 0x9098a1,
        alpha: 0.7,
        alignment: 1,
      });
    this.drawProgressOutline(progress);

    this.promptText.text = text;
    this.promptText.position.set(PANEL_WIDTH / 2, PANEL_HEIGHT / 2);
  }

  private drawProgressOutline(progress: number): void {
    this.outlineProgress.clear();
    if (progress <= 0) return;
    const p = Math.max(0, Math.min(1, progress));
    const x = OUTLINE_INSET;
    const y = OUTLINE_INSET;
    const w = PANEL_WIDTH - OUTLINE_INSET * 2;
    const h = PANEL_HEIGHT - OUTLINE_INSET * 2;
    const total = 2 * (w + h);
    const target = total * p;
    const segments: Array<{
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      len: number;
    }> = [
      { fromX: x, fromY: y, toX: x + w, toY: y, len: w },
      { fromX: x + w, fromY: y, toX: x + w, toY: y + h, len: h },
      { fromX: x + w, fromY: y + h, toX: x, toY: y + h, len: w },
      { fromX: x, fromY: y + h, toX: x, toY: y, len: h },
    ];
    this.outlineProgress.stroke({
      width: OUTLINE_ACTIVE_WIDTH,
      color: 0xcad2db,
      alpha: 0.95,
      alignment: 1,
    });
    let remaining = target;
    for (const segment of segments) {
      if (remaining <= 0) break;
      const drawn = Math.min(remaining, segment.len);
      const t = drawn / segment.len;
      const dx = segment.toX - segment.fromX;
      const dy = segment.toY - segment.fromY;
      this.outlineProgress.moveTo(segment.fromX, segment.fromY);
      this.outlineProgress.lineTo(
        segment.fromX + dx * t,
        segment.fromY + dy * t,
      );
      remaining -= drawn;
    }
  }
}

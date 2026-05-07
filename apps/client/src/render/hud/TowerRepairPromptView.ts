import * as PIXI from "pixi.js";

const PANEL_WIDTH = 260;
const HOLD_DURATION_MS = 750;

export class TowerRepairPromptView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly promptText: PIXI.Text;
  private readonly progressTrack: PIXI.Graphics;
  private readonly progressFill: PIXI.Graphics;

  constructor() {
    this.container = new PIXI.Container();

    this.background = new PIXI.Graphics();
    this.container.addChild(this.background);

    this.promptText = new PIXI.Text({
      text: "Hold F to repair",
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 14,
        fill: 0xfff9e6,
        align: "center",
      },
    });
    this.promptText.anchor.set(0.5, 0.5);
    this.container.addChild(this.promptText);

    this.progressTrack = new PIXI.Graphics();
    this.container.addChild(this.progressTrack);

    this.progressFill = new PIXI.Graphics();
    this.container.addChild(this.progressFill);

    this.container.visible = false;
  }

  public sync(options: {
    visible: boolean;
    towerLabel: string;
    repairCost: number;
    holdStartMs: number | null;
    nowMs: number;
    screenWidth: number;
    screenHeight: number;
  }): void {
    const {
      visible,
      towerLabel,
      repairCost,
      holdStartMs,
      nowMs,
      screenWidth,
      screenHeight,
    } = options;

    this.container.visible = visible;
    if (!visible) {
      return;
    }

    const isHolding = holdStartMs !== null;
    const progress = isHolding
      ? Math.min(1, (nowMs - holdStartMs) / HOLD_DURATION_MS)
      : 0;

    const panelHeight = isHolding ? 64 : 40;
    const panelX = screenWidth / 2 - PANEL_WIDTH / 2;
    const panelY = screenHeight - 220;

    this.background.clear();
    this.background
      .roundRect(0, 0, PANEL_WIDTH, panelHeight, 8)
      .fill({ color: 0x1a120a, alpha: 0.88 })
      .stroke({ width: 1, color: 0xb8860b, alpha: 0.9 });
    this.container.position.set(panelX, panelY);

    this.promptText.text = `Hold F to repair ${towerLabel} (${repairCost} hunk)`;
    this.promptText.position.set(
      PANEL_WIDTH / 2,
      isHolding ? 20 : panelHeight / 2,
    );

    const barX = 12;
    const barY = 38;
    const barWidth = PANEL_WIDTH - 24;

    if (isHolding) {
      this.progressTrack.clear();
      this.progressTrack
        .roundRect(barX, barY, barWidth, 8, 4)
        .fill({ color: 0x3a2a0a, alpha: 1 });

      this.progressFill.clear();
      if (progress > 0) {
        this.progressFill
          .roundRect(barX, barY, barWidth * progress, 8, 4)
          .fill({ color: 0xf0a030, alpha: 1 });
      }

      this.progressTrack.visible = true;
      this.progressFill.visible = true;
    } else {
      this.progressTrack.visible = false;
      this.progressFill.visible = false;
    }
  }

  public destroy(): void {
    this.background.destroy();
    this.promptText.destroy();
    this.progressTrack.destroy();
    this.progressFill.destroy();
    this.container.destroy();
  }
}

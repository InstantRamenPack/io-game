import * as PIXI from "pixi.js";
import { computeClientNightBlend } from "@shared/gameplay/dayNightBlend.ts";
import type { DayNightSnapshot } from "@shared/net/snapshots.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { TextStyleOptions } from "@client/render/renderTypes.ts";

export class DayNightIndicator {
  public readonly container: PIXI.Container;
  private readonly graphic: PIXI.Graphics;
  private readonly label: PIXI.Text;
  private readonly detail: PIXI.Text;
  private readonly barWidth = 200;
  private readonly barHeight = 10;
  private readonly barGap = 6;
  private readonly textDayColor = 0x2d4f37;
  private readonly textNightColor = 0xcfe7d1;
  private readonly contrastLag = 0.12;

  constructor(labelStyle: TextStyleOptions) {
    this.container = new PIXI.Container();
    this.graphic = new PIXI.Graphics();
    this.label = new PIXI.Text("", new PIXI.TextStyle(labelStyle));
    this.detail = new PIXI.Text(
      "",
      new PIXI.TextStyle({ ...labelStyle, fontSize: 12 }),
    );
    this.container.addChild(this.graphic, this.label, this.detail);
  }

  public sync(
    dayNight: DayNightSnapshot | undefined,
    latestSnapshotReceivedAt: number | undefined,
  ): void {
    if (!dayNight) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;

    const driftMs =
      latestSnapshotReceivedAt !== undefined
        ? Math.max(0, performance.now() - latestSnapshotReceivedAt)
        : 0;
    const nightBlend = computeClientNightBlend(dayNight, driftMs);
    const contrastBlend = this.applyContrastLag(nightBlend);
    const labelColor = this.lerpColor(
      this.textDayColor,
      this.textNightColor,
      contrastBlend,
    );

    const phaseLabel = dayNight.phase === "night" ? "Night" : "Day";
    this.label.text = `${phaseLabel} ${dayNight.dayCount + 1}`;
    this.label.style.fill = labelColor;

    const waveThreat =
      dayNight.waveEnemiesRemaining + dayNight.waveSpawnsPending;
    if (dayNight.phase === "night") {
      if (waveThreat <= 0) {
        this.detail.text = "Wave cleared — dawn soon";
      } else {
        const parts: string[] = [];
        if (dayNight.waveEnemiesRemaining > 0) {
          parts.push(
            `${dayNight.waveEnemiesRemaining} wave enem${dayNight.waveEnemiesRemaining === 1 ? "y" : "ies"}`,
          );
        }
        if (dayNight.waveSpawnsPending > 0) {
          parts.push(
            `${dayNight.waveSpawnsPending} spawn batch${dayNight.waveSpawnsPending === 1 ? "" : "es"} left`,
          );
        }
        this.detail.text = parts.join(" · ");
      }
    } else {
      this.detail.text = "Hold the hub until night falls";
    }
    this.detail.style.fill = labelColor;

    const contentWidth = Math.max(
      this.barWidth,
      this.label.width,
      this.detail.width,
    );
    const labelX = Math.max(
      0,
      Math.round((contentWidth - this.label.width) / 2),
    );
    const detailX = Math.max(
      0,
      Math.round((contentWidth - this.detail.width) / 2),
    );
    const barX = Math.max(0, Math.round((contentWidth - this.barWidth) / 2));
    const barY = this.label.height + 4 + this.detail.height + this.barGap;
    this.label.position.set(labelX, 0);
    this.detail.position.set(detailX, this.label.height + 4);

    drawRoundedRect(
      this.graphic,
      barX,
      barY,
      this.barWidth,
      this.barHeight,
      5,
      { color: 0x0b140b, alpha: 0.85 },
    );

    if (dayNight.phase === "night" && waveThreat > 0) {
      const total = Math.max(1, dayNight.waveThreatTotal);
      const clearedFraction = Math.min(1, Math.max(0, 1 - waveThreat / total));
      const fillWidth = Math.max(
        4,
        Math.round(this.barWidth * clearedFraction),
      );
      this.graphic
        .rect(barX, barY, fillWidth, this.barHeight)
        .fill({ color: 0x8b3a3a, alpha: 0.95 });
    } else if (dayNight.phase === "night") {
      this.graphic
        .rect(barX, barY, this.barWidth, this.barHeight)
        .fill({ color: 0x3d8b5a, alpha: 0.95 });
    } else {
      const phaseDuration = dayNight.dayDurationMs;
      const elapsed = Math.min(
        dayNight.phaseElapsedMs + driftMs,
        phaseDuration,
      );
      const progress =
        phaseDuration > 0
          ? Math.min(1, Math.max(0, elapsed / phaseDuration))
          : 0;
      const fillWidth = Math.max(4, Math.round(this.barWidth * progress));
      this.graphic
        .rect(barX, barY, fillWidth, this.barHeight)
        .fill({ color: 0xf2c84b, alpha: 0.95 });
    }
  }

  public setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public get width(): number {
    return Math.max(this.barWidth, this.label.width, this.detail.width);
  }

  public get height(): number {
    return (
      this.label.height + 4 + this.detail.height + this.barGap + this.barHeight
    );
  }

  private applyContrastLag(blend: number): number {
    if (blend >= 0.5) {
      return Math.min(1, blend + this.contrastLag);
    }
    return Math.max(0, blend - this.contrastLag);
  }

  private lerpColor(start: number, end: number, t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    const startR = (start >> 16) & 0xff;
    const startG = (start >> 8) & 0xff;
    const startB = start & 0xff;
    const endR = (end >> 16) & 0xff;
    const endG = (end >> 8) & 0xff;
    const endB = end & 0xff;
    const r = Math.round(startR + (endR - startR) * clamped);
    const g = Math.round(startG + (endG - startG) * clamped);
    const b = Math.round(startB + (endB - startB) * clamped);
    return (r << 16) | (g << 8) | b;
  }
}

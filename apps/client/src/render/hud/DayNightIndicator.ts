import * as PIXI from "pixi.js";
import type { DayNightSnapshot } from "@shared/net/snapshots.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { TextStyleOptions } from "@client/render/renderTypes.ts";

export class DayNightIndicator {
  public readonly container: PIXI.Container;
  private readonly graphic: PIXI.Graphics;
  private readonly label: PIXI.Text;
  private readonly barWidth = 220;
  private readonly barHeight = 14;
  private readonly barGap = 6;
  private readonly textDayColor = 0x2d4f37;
  private readonly textNightColor = 0xcfe7d1;
  private readonly contrastLag = 0.12;

  constructor(labelStyle: TextStyleOptions) {
    this.container = new PIXI.Container();
    this.graphic = new PIXI.Graphics();
    this.label = new PIXI.Text("", new PIXI.TextStyle(labelStyle));
    this.container.addChild(this.graphic, this.label);
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

    const totalDuration = dayNight.nightDurationMs + dayNight.dayDurationMs;
    const baseCycleElapsed =
      dayNight.phase === "night"
        ? dayNight.phaseElapsedMs
        : dayNight.nightDurationMs + dayNight.phaseElapsedMs;
    const driftMs =
      latestSnapshotReceivedAt !== undefined
        ? Math.max(0, performance.now() - latestSnapshotReceivedAt)
        : 0;
    const nightBlend = this.computeNightBlend(dayNight, driftMs);
    const contrastBlend = this.applyContrastLag(nightBlend);
    const labelColor = this.lerpColor(
      this.textDayColor,
      this.textNightColor,
      contrastBlend,
    );
    const cycleElapsed =
      totalDuration > 0 ? (baseCycleElapsed + driftMs) % totalDuration : 0;
    const progress =
      totalDuration > 0
        ? Math.min(1, Math.max(0, cycleElapsed / totalDuration))
        : 0;

    const nightWidth =
      totalDuration > 0
        ? Math.max(
            1,
            Math.round(
              (dayNight.nightDurationMs / totalDuration) * this.barWidth,
            ),
          )
        : Math.floor(this.barWidth / 2);
    const dayWidth = this.barWidth - nightWidth;
    const centerX = Math.round(this.barWidth / 2);

    this.label.text = `Day ${dayNight.dayCount + 1} · ${dayNight.phase}`;
    this.label.style.fill = labelColor;

    const contentWidth = Math.max(this.barWidth, this.label.width);
    const labelX = Math.max(
      0,
      Math.round((contentWidth - this.label.width) / 2),
    );
    const barX = Math.max(0, Math.round((contentWidth - this.barWidth) / 2));
    const barY = this.label.height + this.barGap;
    this.label.position.set(labelX, 0);

    drawRoundedRect(
      this.graphic,
      barX,
      barY,
      this.barWidth,
      this.barHeight,
      6,
      { color: 0x0b140b, alpha: 0.85 },
    );

    const cycleOffset = progress * this.barWidth;
    const cycleStart = centerX - cycleOffset;

    const drawClipped = (x: number, width: number, color: number): void => {
      const start = Math.max(0, Math.round(x));
      const end = Math.min(this.barWidth, Math.round(x + width));
      if (end <= start) {
        return;
      }
      this.graphic
        .rect(barX + start, barY, end - start, this.barHeight)
        .fill({ color, alpha: 0.95 });
    };

    for (let index = -1; index <= 1; index += 1) {
      const segmentStart = cycleStart + index * this.barWidth;
      drawClipped(segmentStart, nightWidth, 0x6a5de3);
      drawClipped(segmentStart + nightWidth, dayWidth, 0xf2c84b);
    }

    this.graphic
      .moveTo(barX + centerX, barY - 2)
      .lineTo(barX + centerX, barY + this.barHeight + 2)
      .stroke({ width: 2, color: labelColor, alpha: 0.9 });
  }

  public setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public get width(): number {
    return Math.max(this.barWidth, this.label.width);
  }

  private computeNightBlend(
    dayNight: DayNightSnapshot,
    driftMs: number,
  ): number {
    const phaseDuration =
      dayNight.phase === "night"
        ? dayNight.nightDurationMs
        : dayNight.dayDurationMs;
    if (phaseDuration <= 0) {
      return dayNight.phase === "night" ? 1 : 0;
    }

    const elapsed = Math.max(
      0,
      Math.min(dayNight.phaseElapsedMs + driftMs, phaseDuration),
    );
    const transitionMs = Math.max(
      1000,
      Math.min(15000, Math.floor(phaseDuration * 0.2)),
    );

    if (elapsed >= phaseDuration - transitionMs) {
      const t = (elapsed - (phaseDuration - transitionMs)) / transitionMs;
      return dayNight.phase === "night" ? 1 - t : t;
    }

    return dayNight.phase === "night" ? 1 : 0;
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

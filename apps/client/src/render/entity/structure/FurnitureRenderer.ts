import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_BY_LABEL: Record<string, number> = {
  "Wooden Bed": 0x8b6f4e,
  "Wooden Chair": 0x6f4e2f,
  "Wooden Table": 0x7a5230,
};

const DEFAULT_FILL = 0x7a5230;
const DEFAULT_STROKE = 0x3a2414;
const HIGHLIGHT = 0xc59b6b;
const SHADOW = 0x3a2414;

export class FurnitureRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const rect = entity.hitboxes[0];
    if (!rect) {
      return;
    }

    switch (entity.label) {
      case "Wooden Bed":
        this.drawBed(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      case "Wooden Chair":
        this.drawChair(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      case "Wooden Table":
        this.drawTable(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      default:
        this.drawBlock(graphics, rect, fillColor, alpha, lineAlpha);
        return;
    }
  }

  protected getFillColor(entity: ClientEntity): number {
    return entity.label
      ? (FILL_BY_LABEL[entity.label] ?? DEFAULT_FILL)
      : DEFAULT_FILL;
  }

  private drawTable(
    graphics: PIXI.Graphics,
    rect: ClientEntity["hitboxes"][number],
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    graphics
      .roundRect(x, y, rect.width, rect.height, 5)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: DEFAULT_STROKE, alpha: lineAlpha });
    graphics
      .rect(x + 10, y + 9, rect.width - 20, 4)
      .fill({ color: HIGHLIGHT, alpha: alpha * 0.45 });
    for (const leg of [
      [x + 10, y + 8],
      [x + rect.width - 18, y + 8],
      [x + 10, y + rect.height - 16],
      [x + rect.width - 18, y + rect.height - 16],
    ] as const) {
      graphics
        .rect(leg[0], leg[1], 8, 8)
        .fill({ color: SHADOW, alpha: alpha * 0.5 });
    }
  }

  private drawChair(
    graphics: PIXI.Graphics,
    rect: ClientEntity["hitboxes"][number],
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    graphics
      .roundRect(x + 5, y + 12, rect.width - 10, rect.height - 14, 4)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: DEFAULT_STROKE, alpha: lineAlpha });
    graphics
      .roundRect(x + 4, y + 4, rect.width - 8, 12, 3)
      .fill({ color: SHADOW, alpha: alpha * 0.72 });
    graphics
      .rect(x + 10, y + 18, rect.width - 20, 3)
      .fill({ color: HIGHLIGHT, alpha: alpha * 0.32 });
  }

  private drawBed(
    graphics: PIXI.Graphics,
    rect: ClientEntity["hitboxes"][number],
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    graphics
      .roundRect(x, y, rect.width, rect.height, 5)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: DEFAULT_STROKE, alpha: lineAlpha });
    graphics
      .roundRect(x + 8, y + 8, 28, rect.height - 16, 4)
      .fill({ color: 0xd6c4a4, alpha: alpha * 0.9 });
    graphics
      .rect(x + 42, y + 8, rect.width - 52, rect.height - 16)
      .fill({ color: 0x6b4a35, alpha: alpha * 0.55 });
    graphics
      .rect(x + 44, y + 14, rect.width - 56, 4)
      .fill({ color: HIGHLIGHT, alpha: alpha * 0.25 });
  }

  private drawBlock(
    graphics: PIXI.Graphics,
    rect: ClientEntity["hitboxes"][number],
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    graphics
      .roundRect(
        rect.offsetX - rect.width / 2,
        rect.offsetY - rect.height / 2,
        rect.width,
        rect.height,
        4,
      )
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: DEFAULT_STROKE, alpha: lineAlpha });
  }
}

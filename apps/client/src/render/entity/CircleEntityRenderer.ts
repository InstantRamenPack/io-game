import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { drawCircle } from "@client/render/pixi/PixiGraphicUtils.ts";
import type * as PIXI from "pixi.js";

export class CircleEntityRenderer extends BaseEntityRenderer {
  constructor(
    pixiRenderer: PixiRenderer,
    private readonly fillColor: number,
    options: EntityRendererOptions = {},
  ) {
    super(pixiRenderer, options);
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    drawCircle(
      graphics,
      0,
      0,
      this.getVisualRadius(entity),
      { color: fillColor, alpha },
      { width: 2, color: 0x000000, alpha: lineAlpha },
    );
    const armorStroke = this.getArmorStroke(entity);
    if (armorStroke) {
      graphics.circle(0, 0, this.getVisualRadius(entity) + 3).stroke({
        width: 3,
        color: armorStroke.color,
        alpha: armorStroke.alpha,
      });
    }
  }

  protected getFillColor(_entity: ClientEntity): number {
    return this.fillColor;
  }

  private getArmorStroke(
    entity: ClientEntity,
  ): { color: number; alpha: number } | null {
    switch (entity.armorTier) {
      case 1:
        return { color: 0xb6c2cf, alpha: 0.8 };
      case 2:
        return { color: 0x7fb8ff, alpha: 0.85 };
      case 3:
        return { color: 0xc68cff, alpha: 0.9 };
      case 4:
        return { color: 0xffd36b, alpha: 0.95 };
      default:
        return null;
    }
  }
}

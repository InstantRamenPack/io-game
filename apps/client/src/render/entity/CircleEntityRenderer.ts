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
  }

  protected getFillColor(_entity: ClientEntity): number {
    return this.fillColor;
  }
}

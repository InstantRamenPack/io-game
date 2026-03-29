import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type * as PIXI from "pixijs";

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
    graphics.clear();
    graphics.lineStyle(2, 0x000000, lineAlpha);
    graphics.beginFill(fillColor, alpha);
    graphics.drawCircle(0, 0, this.getVisualRadius(entity));
    graphics.endFill();
  }

  protected getFillColor(_entity: ClientEntity): number {
    return this.fillColor;
  }
}

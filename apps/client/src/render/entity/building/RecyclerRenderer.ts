import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import * as PIXI from "pixi.js";

export class RecyclerRenderer extends BaseEntityRenderer {
  private readonly symbolText: PIXI.Text;

  constructor(pixiRenderer: PixiRenderer, options?: EntityRendererOptions) {
    super(pixiRenderer, options);
    this.symbolText = new PIXI.Text({
      text: "♻",
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 52,
        fill: 0x7dd87a,
      },
    });
    this.symbolText.anchor.set(0.5, 0.5);
    this.symbolText.position.set(0, -10);
    this.entityContainer.addChild(this.symbolText);
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;

    // Main body
    graphics
      .roundRect(minX, minY, width, height, 8)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: 0x0d2b0d, alpha: lineAlpha });

    // Inset panel to give the structure depth
    const inset = 6;
    graphics
      .roundRect(
        minX + inset,
        minY + inset,
        width - inset * 2,
        height - inset * 2,
        5,
      )
      .fill({ color: 0x1b4d2a, alpha: alpha * 0.6 });

    // Label strip at the top
    graphics
      .roundRect(minX + inset, minY + inset, width - inset * 2, 22, 4)
      .fill({ color: 0x0d2b0d, alpha: alpha * 0.75 });
  }

  protected getFillColor(): number {
    return 0x2d6a4f;
  }

  public override destroy(): void {
    this.symbolText.destroy();
    super.destroy();
  }
}

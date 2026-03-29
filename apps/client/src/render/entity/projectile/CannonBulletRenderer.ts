import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class CannonBulletRenderer extends CircleEntityRenderer {
  public constructor(
    pixiRenderer: PixiRenderer,
    options: EntityRendererOptions = {},
  ) {
    super(pixiRenderer, 0xffb703, options);
  }
}

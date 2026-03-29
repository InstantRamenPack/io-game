import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class PlayerRenderer extends CircleEntityRenderer {
  public constructor(
    pixiRenderer: PixiRenderer,
    options: EntityRendererOptions = {},
  ) {
    super(pixiRenderer, 0x67d944, options);
  }
}

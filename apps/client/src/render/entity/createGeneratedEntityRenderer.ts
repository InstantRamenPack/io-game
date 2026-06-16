import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { TrailProjectileRenderer } from "@client/render/entity/projectile/TrailProjectileRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export function createCircleEntityRendererCtor(
  fillColor: number,
): new (
  pixiRenderer: PixiRenderer,
  options?: EntityRendererOptions,
) => EntityRenderer {
  return class GeneratedCircleEntityRenderer extends CircleEntityRenderer {
    constructor(
      pixiRenderer: PixiRenderer,
      options: EntityRendererOptions = {},
    ) {
      super(pixiRenderer, fillColor, options);
    }
  };
}

export function createTrailProjectileRendererCtor(
  fillColor: number,
): new (
  pixiRenderer: PixiRenderer,
  options?: EntityRendererOptions,
) => EntityRenderer {
  return class GeneratedTrailProjectileRenderer extends TrailProjectileRenderer {
    constructor(
      pixiRenderer: PixiRenderer,
      options: EntityRendererOptions = {},
    ) {
      super(pixiRenderer, fillColor, options);
    }
  };
}

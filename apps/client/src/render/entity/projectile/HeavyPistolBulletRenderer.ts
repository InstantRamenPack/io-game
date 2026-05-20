// Scaffolded by scripts/generate-content-manifest.ts. Safe to edit; the generator will not overwrite this file.
import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class HeavyPistolBulletRenderer extends CircleEntityRenderer {
  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, 0xdf41e3, options);
  }
}

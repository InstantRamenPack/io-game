import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import { TrailProjectileRenderer } from "@client/render/entity/projectile/TrailProjectileRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class CannonBulletRenderer extends TrailProjectileRenderer {
  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, 0xffb703, options);
  }
}

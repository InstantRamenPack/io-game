import { Rectangle } from "pixi.js";
import type { Container } from "pixi.js";

type WorldSize = { w: number; h: number };

export class PixiCullingController {
  private readonly worldBounds = new Rectangle();

  public configure(options: {
    worldRoot: Container;
    entityLayer: Container;
    effectLayer: Container;
    placementLayer?: Container;
    hudRoot: Container;
    worldSize: WorldSize;
  }): void {
    this.worldBounds.copyFrom(new Rectangle(0, 0, options.worldSize.w, options.worldSize.h));
    options.worldRoot.cullable = false;
    options.worldRoot.cullableChildren = true;
    options.entityLayer.cullable = true;
    options.entityLayer.cullArea = this.worldBounds;
    options.effectLayer.cullable = true;
    options.effectLayer.cullArea = this.worldBounds;
    if (options.placementLayer) {
      options.placementLayer.cullable = true;
      options.placementLayer.cullArea = this.worldBounds;
    }
    options.hudRoot.cullableChildren = false;
  }

  public updateWorldSize(worldSize: WorldSize): void {
    this.worldBounds.copyFrom(new Rectangle(0, 0, worldSize.w, worldSize.h));
  }
}


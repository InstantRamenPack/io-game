import { Rectangle } from "pixi.js";
import type { Container } from "pixi.js";
import type { WorldSize } from "@client/render/renderTypes.ts";

export class PixiCullingController {
  private readonly worldBounds = new Rectangle();
  private readonly cullArea = new Rectangle();
  private entityLayer?: Container;
  private effectLayer?: Container;
  private placementLayer?: Container;
  private worldRoot?: Container;
  private readonly cullPadding = 160;

  public configure(options: {
    worldRoot: Container;
    entityLayer: Container;
    effectLayer: Container;
    placementLayer?: Container;
    hudRoot: Container;
    worldSize: WorldSize;
  }): void {
    this.worldBounds.copyFrom(
      new Rectangle(0, 0, options.worldSize.w, options.worldSize.h),
    );
    this.worldRoot = options.worldRoot;
    this.entityLayer = options.entityLayer;
    this.effectLayer = options.effectLayer;
    this.placementLayer = options.placementLayer;
    options.worldRoot.cullable = false;
    options.worldRoot.cullableChildren = true;
    options.entityLayer.cullable = false;
    options.effectLayer.cullable = false;
    if (options.placementLayer) {
      options.placementLayer.cullable = false;
    }
    options.hudRoot.cullableChildren = false;

    this.updateViewport(0, 0, this.worldBounds.width, this.worldBounds.height);
  }

  public updateWorldSize(worldSize: WorldSize): void {
    this.worldBounds.copyFrom(new Rectangle(0, 0, worldSize.w, worldSize.h));
    this.updateViewport(0, 0, worldSize.w, worldSize.h);
  }

  public updateViewport(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): void {
    const paddedMinX = Math.max(0, minX - this.cullPadding);
    const paddedMinY = Math.max(0, minY - this.cullPadding);
    const paddedMaxX = Math.min(
      this.worldBounds.width,
      maxX + this.cullPadding,
    );
    const paddedMaxY = Math.min(
      this.worldBounds.height,
      maxY + this.cullPadding,
    );
    this.cullArea.x = paddedMinX;
    this.cullArea.y = paddedMinY;
    this.cullArea.width = Math.max(1, paddedMaxX - paddedMinX);
    this.cullArea.height = Math.max(1, paddedMaxY - paddedMinY);

    if (this.worldRoot) {
      this.worldRoot.cullArea = this.cullArea;
    }

    this.updateLayerCull(this.entityLayer);
    this.updateLayerCull(this.effectLayer);
    this.updateLayerCull(this.placementLayer);
  }

  private updateLayerCull(layer: Container | undefined): void {
    if (!layer) {
      return;
    }

    for (const child of layer.children) {
      child.cullable = true;
      child.cullArea = this.cullArea;
    }
  }
}

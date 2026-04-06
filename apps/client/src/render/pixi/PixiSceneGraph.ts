import { Container, Graphics } from "pixi.js";
import type { Application } from "pixi.js";

export class PixiSceneGraph {
  public readonly worldRoot = new Container({ label: "worldRoot" });
  public readonly hudRoot = new Container({ label: "hudRoot" });
  public readonly gridLayer = new Container({ label: "gridLayer" });
  public readonly effectLayer = new Container({ label: "effectLayer" });
  public readonly entityLayer = new Container({ label: "entityLayer" });
  public readonly hudLayer = new Container({ label: "hudLayer" });
  public readonly overlayLayer = new Container({ label: "overlayLayer" });
  public readonly gridGraphic = new Graphics();

  constructor() {
    this.worldRoot.enableRenderGroup();
    this.hudRoot.enableRenderGroup();

    this.worldRoot.interactiveChildren = false;
    this.effectLayer.interactiveChildren = false;
    this.entityLayer.interactiveChildren = false;
    this.gridLayer.interactiveChildren = false;
    this.hudRoot.cullableChildren = false;
    this.worldRoot.cullableChildren = true;

    this.gridLayer.addChild(this.gridGraphic);
    this.gridLayer.cacheAsTexture(true);

    this.worldRoot.addChild(
      this.gridLayer,
      this.effectLayer,
      this.entityLayer,
    );
    this.hudRoot.addChild(this.overlayLayer, this.hudLayer);
  }

  public attach(app: Application): void {
    if (this.worldRoot.parent !== app.stage) {
      app.stage.addChild(this.worldRoot);
    }
    if (this.hudRoot.parent !== app.stage) {
      app.stage.addChild(this.hudRoot);
    }
  }

  public updateGridCache(): void {
    this.gridLayer.updateCacheTexture();
  }
}


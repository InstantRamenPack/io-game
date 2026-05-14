import { Container, Graphics } from "pixi.js";
import type { Application } from "pixi.js";

export class PixiSceneGraph {
  public readonly worldRoot = new Container({ label: "worldRoot" });
  public readonly hudRoot = new Container({ label: "hudRoot" });
  public readonly gridLayer = new Container({ label: "gridLayer" });
  public readonly effectLayer = new Container({ label: "effectLayer" });
  public readonly entityLayer = new Container({ label: "entityLayer" });
  public readonly placementLayer = new Container({ label: "placementLayer" });
  public readonly hudLayer = new Container({ label: "hudLayer" });
  public readonly overlayLayer = new Container({ label: "overlayLayer" });
  public readonly gridBackgroundGraphic = new Graphics();
  public readonly landmarkGraphic = new Graphics();
  public readonly gridLinesGraphic = new Graphics();

  constructor() {
    this.worldRoot.enableRenderGroup();
    this.hudRoot.enableRenderGroup();

    this.worldRoot.interactiveChildren = false;
    this.effectLayer.interactiveChildren = false;
    this.entityLayer.interactiveChildren = false;
    this.entityLayer.sortableChildren = true;
    this.placementLayer.interactiveChildren = false;
    this.gridLayer.interactiveChildren = false;
    this.hudRoot.cullableChildren = false;
    this.worldRoot.cullableChildren = true;

    this.gridLayer.addChild(this.gridBackgroundGraphic, this.landmarkGraphic);

    this.worldRoot.addChild(
      this.gridLayer,
      this.effectLayer,
      this.entityLayer,
      this.placementLayer,
    );
    this.hudRoot.addChild(
      this.gridLinesGraphic,
      this.overlayLayer,
      this.hudLayer,
    );
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
    // no-op: grid lines are now redrawn each frame in screen space
  }
}

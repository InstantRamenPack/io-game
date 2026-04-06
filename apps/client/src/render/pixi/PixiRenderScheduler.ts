import type { Application } from "pixi.js";
import type { PixiHud } from "@client/render/PixiHud.ts";

export class PixiRenderScheduler {
  private dirty = true;

  public markDirty(): void {
    this.dirty = true;
  }

  public render(
    app: Application,
    hud: PixiHud | null,
    force = false,
  ): void {
    if (!force && !this.dirty) {
      return;
    }

    hud?.render(app, force);
    app.renderer.render(app.stage);
    this.dirty = false;
  }
}

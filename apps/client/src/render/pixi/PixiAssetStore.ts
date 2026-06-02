import { Assets, Graphics, Texture } from "pixi.js";
import type { Application } from "pixi.js";
import { getItemRenderingEntries } from "@shared/content/catalog.ts";

export type HudTextureId =
  | "armor-filled"
  | "armor-empty"
  | "bullet-filled"
  | "bullet-empty";

const HUD_TEXTURE_URLS: Record<HudTextureId, string> = {
  "armor-filled": "/hud/armor-filled.png",
  "armor-empty": "/hud/armor-empty.png",
  "bullet-filled": "/hud/bullet-filled.png",
  "bullet-empty": "/hud/bullet-empty.png",
};

export class PixiAssetStore {
  private readonly itemTextures = new Map<string, Texture>();
  private readonly hudTextures = new Map<HudTextureId, Texture>();
  private readonly particleTextures = new Map<string, Texture>();
  private placeholderItemTexture: Texture | null = null;

  public async load(app: Application): Promise<void> {
    await this.loadItemTextures();
    await this.loadHudTextures();
    this.buildParticleTextures(app);
  }

  public getItemTexture(typeId: string): Texture {
    return (
      this.itemTextures.get(typeId) ??
      this.placeholderItemTexture ??
      Texture.WHITE
    );
  }

  public getItemSpriteTexture(typeId: string): Texture {
    return this.getItemTexture(typeId);
  }

  public getHudTexture(id: HudTextureId): Texture {
    return this.hudTextures.get(id) ?? Texture.WHITE;
  }

  public getParticleTexture(kind: "soft-circle" | "ring"): Texture {
    return this.particleTextures.get(kind) ?? Texture.WHITE;
  }

  private async loadItemTextures(): Promise<void> {
    const entries = getItemRenderingEntries();
    const urlsToLoad = new Set<string>(["/placeholder.png"]);
    for (const [, rendering] of entries) {
      urlsToLoad.add(rendering.assetPath);
    }

    await Promise.all([...urlsToLoad].map((url) => Assets.load(url)));

    this.placeholderItemTexture = Texture.from("/placeholder.png");
    this.itemTextures.clear();
    for (const [typeId, rendering] of entries) {
      this.itemTextures.set(typeId, Texture.from(rendering.assetPath));
    }
  }

  private async loadHudTextures(): Promise<void> {
    await Promise.all(
      Object.values(HUD_TEXTURE_URLS).map(async (url) => {
        await Assets.load(url);
      }),
    );

    this.hudTextures.clear();
    for (const [id, url] of Object.entries(HUD_TEXTURE_URLS)) {
      this.hudTextures.set(id as HudTextureId, Texture.from(url));
    }
  }

  private buildParticleTextures(app: Application): void {
    this.particleTextures.set(
      "soft-circle",
      this.createCircleTexture(app, {
        size: 32,
        fillColor: 0xffffff,
        fillAlpha: 1,
      }),
    );
    this.particleTextures.set(
      "ring",
      this.createCircleTexture(app, {
        size: 64,
        fillColor: 0xffffff,
        fillAlpha: 0,
        strokeWidth: 6,
        strokeColor: 0xffffff,
        strokeAlpha: 1,
      }),
    );
  }

  private createCircleTexture(
    app: Application,
    options: {
      size: number;
      fillColor: number;
      fillAlpha: number;
      strokeWidth?: number;
      strokeColor?: number;
      strokeAlpha?: number;
    },
  ): Texture {
    const graphic = new Graphics();
    const radius = options.size / 2;
    graphic
      .circle(radius, radius, radius - (options.strokeWidth ?? 0) / 2)
      .fill({ color: options.fillColor, alpha: options.fillAlpha });
    if (options.strokeWidth && options.strokeColor !== undefined) {
      graphic.circle(radius, radius, radius - options.strokeWidth / 2).stroke({
        width: options.strokeWidth,
        color: options.strokeColor,
        alpha: options.strokeAlpha ?? 1,
      });
    }
    const texture = app.renderer.generateTexture(graphic);
    graphic.destroy();
    return texture;
  }
}

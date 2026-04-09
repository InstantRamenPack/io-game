import { Assets, Graphics, Texture } from "pixi.js";
import type { Application } from "pixi.js";

export class PixiAssetStore {
  private readonly itemTextures = new Map<string, Texture>();
  private readonly itemSpriteTextures = new Map<string, Texture>();
  private readonly particleTextures = new Map<string, Texture>();
  private placeholderItemTexture: Texture | null = null;
  private itemIconMap: Record<string, string> = {};

  public async load(app: Application): Promise<void> {
    await Promise.all([this.loadItemIcons(), this.loadItemSprites()]);
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
    return (
      this.itemSpriteTextures.get(typeId) ??
      this.itemTextures.get(typeId) ??
      this.placeholderItemTexture ??
      Texture.WHITE
    );
  }

  public getParticleTexture(kind: "soft-circle" | "ring"): Texture {
    return this.particleTextures.get(kind) ?? Texture.WHITE;
  }

  private async loadItemIcons(): Promise<void> {
    const mappingUrl = "/item_icons.json";
    let iconMap: Record<string, string> = {};

    try {
      const response = await fetch(mappingUrl);
      if (response.ok) {
        const payload = (await response.json()) as Record<string, string>;
        if (payload && typeof payload === "object") {
          iconMap = payload;
        }
      }
    } catch {
      iconMap = {};
    }

    const defaultPath = iconMap.__default__ || "/hud/icons/placeholder.png";
    this.itemIconMap = { ...iconMap };
    const iconEntries = Object.entries(iconMap).filter(
      ([key, value]) => key !== "__default__" && typeof value === "string",
    );

    const urlsToLoad = new Set<string>([defaultPath]);
    for (const [, url] of iconEntries) {
      if (url) {
        urlsToLoad.add(url);
      }
    }

    await Promise.all(
      Array.from(urlsToLoad, async (url) => {
        await Assets.load(url);
      }),
    );

    this.placeholderItemTexture = Texture.from(defaultPath);
    this.itemTextures.clear();
    for (const [typeId, url] of iconEntries) {
      if (url) {
        this.itemTextures.set(typeId, Texture.from(url));
      }
    }
  }

  private async loadItemSprites(): Promise<void> {
    let spriteMap: Record<string, string> = {};
    try {
      const response = await fetch("/item_sprites.json");
      if (response.ok) {
        const payload = (await response.json()) as Record<string, string>;
        if (payload && typeof payload === "object") {
          spriteMap = payload;
        }
      }
    } catch {
      spriteMap = {};
    }

    const spriteEntries = Object.entries(spriteMap).filter(() => true);

    await Promise.all(
      spriteEntries.map(async ([, url]) => {
        if (url) {
          await Assets.load(url);
        }
      }),
    );

    this.itemSpriteTextures.clear();
    for (const [typeId, url] of spriteEntries) {
      if (url) {
        this.itemSpriteTextures.set(typeId, Texture.from(url));
      }
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

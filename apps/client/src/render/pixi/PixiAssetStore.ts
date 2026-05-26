import { Assets, Graphics, Texture } from "pixi.js";
import type { Application } from "pixi.js";
import { isJsonObject, type JsonValue } from "@shared/json.ts";

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
  private readonly itemSpriteTextures = new Map<string, Texture>();
  private readonly hudTextures = new Map<HudTextureId, Texture>();
  private readonly particleTextures = new Map<string, Texture>();
  private placeholderItemTexture: Texture | null = null;
  private itemIconMap: Record<string, string> = {};

  public async load(app: Application): Promise<void> {
    await this.loadItemIcons();
    await this.loadItemSprites();
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
    return (
      this.itemSpriteTextures.get(typeId) ??
      this.itemTextures.get(typeId) ??
      this.placeholderItemTexture ??
      Texture.WHITE
    );
  }

  public getHudTexture(id: HudTextureId): Texture {
    return this.hudTextures.get(id) ?? Texture.WHITE;
  }

  public getParticleTexture(kind: "soft-circle" | "ring"): Texture {
    return this.particleTextures.get(kind) ?? Texture.WHITE;
  }

  private async loadItemIcons(): Promise<void> {
    const mappingUrl = "/item_icons.json";
    const iconMap = await this.loadTextureMap(mappingUrl);
    const defaultPath = iconMap.__default__;
    if (!defaultPath) {
      throw new Error(`Missing __default__ entry in ${mappingUrl}.`);
    }

    this.itemIconMap = { ...iconMap };
    const iconEntries = Object.entries(iconMap).filter(
      ([key]) => key !== "__default__",
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
    const spriteEntries = Object.entries(
      await this.loadTextureMap("/item_sprites.json"),
    );

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

  private async loadTextureMap(url: string): Promise<Record<string, string>> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to load ${url}: ${response.status} ${response.statusText}`.trim(),
      );
    }

    const payload: JsonValue = await response.json();
    if (!isJsonObject(payload)) {
      throw new Error(`Invalid texture map in ${url}. Expected an object.`);
    }

    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid texture map entry for "${key}" in ${url}. Expected a string.`,
        );
      }
      map[key] = value;
    }

    return map;
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

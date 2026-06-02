import type * as PIXI from "pixi.js";
import { getItemRendering } from "@shared/content/catalog.ts";
import type { ItemIconRendering } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export function syncItemIconSprite(options: {
  sprite: PIXI.Sprite;
  typeId: ResourceId;
  texture: PIXI.Texture;
  boxSize: number;
  centerX: number;
  centerY: number;
  padding?: number;
  icon?: ItemIconRendering;
}): void {
  const { sprite, typeId, texture, boxSize, centerX, centerY } = options;
  const rendering = getItemRendering(typeId);
  const icon = options.icon ??
    rendering?.icon ?? {
    x: 0,
    y: 0,
    rotationDeg: 0,
    scale: 1,
  };
  const maxSize = Math.max(1, boxSize - (options.padding ?? 0) * 2);
  const textureWidth = Math.max(1, texture.width);
  const textureHeight = Math.max(1, texture.height);
  const fitScale = maxSize / Math.max(textureWidth, textureHeight);

  sprite.texture = texture;
  sprite.anchor.set(0.5);
  sprite.scale.set(fitScale * icon.scale);
  sprite.rotation = (icon.rotationDeg * Math.PI) / 180;
  sprite.position.set(centerX + icon.x, centerY + icon.y);
  sprite.visible = true;
}

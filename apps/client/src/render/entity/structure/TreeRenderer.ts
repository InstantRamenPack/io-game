import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { getTreeCanopyRadiusFromHitboxWidth } from "@shared/content/structure/treeVisual.ts";
import type * as PIXI from "pixi.js";

const CANOPY_DARK = 0x2d5a27;
const CANOPY_MID = 0x3a7a32;
const CANOPY_HIGHLIGHT = 0x4d9e42;
const TRUNK_COLOR = 0x6b4226;
const SHADOW_COLOR = 0x1a3010;

export class TreeRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const cx = entity.hitboxBounds.centerX;
    const cy = entity.hitboxBounds.centerY;
    const r = (entity.hitboxBounds.width * Math.SQRT2) / 2;
    const canopyRadius = getTreeCanopyRadiusFromHitboxWidth(
      entity.hitboxBounds.width,
    );

    // Shadow beneath canopy
    graphics
      .ellipse(cx + r * 0.08, cy + r * 0.18, r * 0.72, r * 0.28)
      .fill({ color: SHADOW_COLOR, alpha: alpha * 0.35 });

    // Trunk — visible below the canopy
    const trunkW = r * 0.22;
    const trunkH = r * 0.55;
    const trunkTop = cy + r * 0.08;
    graphics
      .rect(cx - trunkW / 2, trunkTop, trunkW, trunkH)
      .fill({ color: TRUNK_COLOR, alpha });

    // Canopy base — centered on hitbox; radius matches lights-out occlusion.
    graphics
      .circle(cx, cy, canopyRadius)
      .fill({ color: CANOPY_DARK, alpha })
      .stroke({ width: 2.5, color: 0x1a3a14, alpha: lineAlpha * 0.8 });

    // Mid-tone cluster — left
    graphics
      .circle(cx - r * 0.32, cy - r * 0.06, r * 0.52)
      .fill({ color: CANOPY_MID, alpha });

    // Mid-tone cluster — right
    graphics
      .circle(cx + r * 0.28, cy - r * 0.1, r * 0.48)
      .fill({ color: CANOPY_MID, alpha });

    // Highlight — upper center
    graphics
      .circle(cx - r * 0.1, cy - r * 0.24, r * 0.35)
      .fill({ color: CANOPY_HIGHLIGHT, alpha: alpha * 0.85 });
  }

  protected getFillColor(): number {
    return CANOPY_DARK;
  }
}

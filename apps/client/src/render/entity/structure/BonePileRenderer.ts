import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const BONE = 0xe7e2cf;
const BONE_DARK = 0xbab48f;

export class BonePileRenderer extends BaseEntityRenderer {
  protected getFillColor(_entity: ClientEntity): number {
    return BONE;
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const rect = entity.hitboxes[0];
    if (!rect) {
      return;
    }

    const cx = rect.offsetX;
    const cy = rect.offsetY;
    const w = rect.width;
    const h = rect.height;
    for (const bone of [
      { bx: cx - w * 0.26, by: cy + h * 0.18, len: w * 0.5, rot: 0.35 },
      { bx: cx + w * 0.08, by: cy + h * 0.26, len: w * 0.46, rot: -0.5 },
      { bx: cx - w * 0.05, by: cy - h * 0.04, len: w * 0.42, rot: 0.1 },
    ]) {
      this.drawBone(graphics, bone.bx, bone.by, bone.len, bone.rot, alpha);
    }
    const skullR = Math.min(w, h) * 0.26;
    const sx = cx + w * 0.18;
    const sy = cy - h * 0.12;
    graphics
      .circle(sx, sy, skullR)
      .fill({ color: BONE, alpha })
      .stroke({ width: 1.5, color: BONE_DARK, alpha: lineAlpha });
    graphics
      .rect(sx - skullR * 0.6, sy + skullR * 0.5, skullR * 1.2, skullR * 0.5)
      .fill({ color: BONE, alpha });
    graphics
      .circle(sx - skullR * 0.38, sy - skullR * 0.1, skullR * 0.26)
      .fill({ color: 0x26201c, alpha });
    graphics
      .circle(sx + skullR * 0.38, sy - skullR * 0.1, skullR * 0.26)
      .fill({ color: 0x26201c, alpha });
  }

  private drawBone(
    graphics: PIXI.Graphics,
    cx: number,
    cy: number,
    length: number,
    rotation: number,
    alpha: number,
  ): void {
    const half = length / 2;
    const dx = Math.cos(rotation) * half;
    const dy = Math.sin(rotation) * half;
    const thickness = Math.max(3, length * 0.12);
    graphics
      .moveTo(cx - dx, cy - dy)
      .lineTo(cx + dx, cy + dy)
      .stroke({ width: thickness, color: BONE, alpha });
    for (const sign of [-1, 1]) {
      const ex = cx + dx * sign;
      const ey = cy + dy * sign;
      const px = Math.cos(rotation + Math.PI / 2) * thickness * 0.6;
      const py = Math.sin(rotation + Math.PI / 2) * thickness * 0.6;
      graphics
        .circle(ex + px, ey + py, thickness * 0.62)
        .fill({ color: BONE, alpha });
      graphics
        .circle(ex - px, ey - py, thickness * 0.62)
        .fill({ color: BONE, alpha });
    }
  }
}

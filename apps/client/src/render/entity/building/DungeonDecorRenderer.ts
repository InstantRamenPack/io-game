import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

type DecorRect = ClientEntity["hitboxes"][number];

const FILL_BY_LABEL: Record<string, number> = {
  "Stone Pillar": 0x8a8a93,
  Brazier: 0x3b3b42,
  Barrel: 0x8a5a2b,
  "Bone Pile": 0xe7e2cf,
  "Gold Pile": 0xffcf3f,
  "Golden Statue": 0xf6c64b,
  "Weapon Rack": 0x6e451f,
  Throne: 0x4a4a55,
};

const DEFAULT_FILL = 0x6b6b73;
const STONE_DARK = 0x4a4a52;
const STONE_LIGHT = 0xb6b6c0;
const STONE_OUTLINE = 0x32323a;
const WOOD_DARK = 0x5d3c1c;
const WOOD_OUTLINE = 0x3a2414;
const METAL = 0xb9bcc6;
const METAL_DARK = 0x5c5f68;
const GOLD = 0xffcf3f;
const GOLD_DARK = 0xc99421;
const GOLD_LIGHT = 0xfff2a8;
const BONE = 0xe7e2cf;
const BONE_DARK = 0xbab48f;
const FLAME_OUTER = 0xe2531a;
const FLAME_MID = 0xff9a2e;
const FLAME_CORE = 0xffe26a;
const CUSHION = 0x8e1f24;

/**
 * Shared renderer for the procedurally placed dungeon-room decor structures.
 * Each room role pulls a distinct subset of these props so rooms read as a
 * treasure vault, armory, throne room, den, etc. The concrete shape is keyed by
 * the entity label so a single drawing surface backs every decor subclass.
 */
export abstract class DungeonDecorRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const rect = entity.hitboxes[0];
    if (!rect) {
      return;
    }

    switch (entity.label) {
      case "Stone Pillar":
        this.drawStonePillar(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      case "Brazier":
        this.drawBrazier(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      case "Barrel":
        this.drawBarrel(graphics, rect, fillColor, alpha, lineAlpha);
        return;
      case "Bone Pile":
        this.drawBonePile(graphics, rect, alpha, lineAlpha);
        return;
      case "Gold Pile":
        this.drawGoldPile(graphics, rect, alpha, lineAlpha);
        return;
      case "Golden Statue":
        this.drawGoldenStatue(graphics, rect, alpha, lineAlpha);
        return;
      case "Weapon Rack":
        this.drawWeaponRack(graphics, rect, alpha, lineAlpha);
        return;
      case "Throne":
        this.drawThrone(graphics, rect, alpha, lineAlpha);
        return;
      default:
        this.drawBlock(graphics, rect, fillColor, alpha, lineAlpha);
        return;
    }
  }

  protected getFillColor(entity: ClientEntity): number {
    return entity.label
      ? (FILL_BY_LABEL[entity.label] ?? DEFAULT_FILL)
      : DEFAULT_FILL;
  }

  private drawStonePillar(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    graphics
      .roundRect(x + 2, y + 2, rect.width - 4, rect.height - 4, 8)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: STONE_OUTLINE, alpha: lineAlpha });
    graphics
      .rect(x + 6, y + 6, rect.width - 12, 6)
      .fill({ color: STONE_LIGHT, alpha: alpha * 0.5 });
    graphics
      .rect(x + 6, y + rect.height - 12, rect.width - 12, 6)
      .fill({ color: STONE_DARK, alpha: alpha * 0.55 });
    graphics
      .rect(rect.offsetX - 2, y + 12, 4, rect.height - 24)
      .fill({ color: STONE_DARK, alpha: alpha * 0.35 });
  }

  private drawBrazier(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const cx = rect.offsetX;
    const cy = rect.offsetY;
    const radius = Math.min(rect.width, rect.height) / 2;
    graphics
      .circle(cx, cy, radius * 0.92)
      .fill({ color: 0xff8a3a, alpha: alpha * 0.16 });
    graphics
      .circle(cx, cy + radius * 0.2, radius * 0.7)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: 0x202024, alpha: lineAlpha });
    graphics
      .ellipse(cx, cy + radius * 0.16, radius * 0.62, radius * 0.32)
      .fill({ color: 0x232327, alpha });
    graphics
      .poly([
        cx - radius * 0.42,
        cy + radius * 0.12,
        cx,
        cy - radius * 0.95,
        cx + radius * 0.42,
        cy + radius * 0.12,
      ])
      .fill({ color: FLAME_OUTER, alpha });
    graphics
      .poly([
        cx - radius * 0.26,
        cy + radius * 0.04,
        cx,
        cy - radius * 0.62,
        cx + radius * 0.26,
        cy + radius * 0.04,
      ])
      .fill({ color: FLAME_MID, alpha });
    graphics
      .poly([
        cx - radius * 0.12,
        cy,
        cx,
        cy - radius * 0.34,
        cx + radius * 0.12,
        cy,
      ])
      .fill({ color: FLAME_CORE, alpha });
  }

  private drawBarrel(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    graphics
      .roundRect(x + 3, y + 1, rect.width - 6, rect.height - 2, 10)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: WOOD_OUTLINE, alpha: lineAlpha });
    for (const staveX of [
      x + rect.width * 0.36,
      x + rect.width * 0.5,
      x + rect.width * 0.64,
    ]) {
      graphics
        .rect(staveX - 1, y + 4, 2, rect.height - 8)
        .fill({ color: WOOD_DARK, alpha: alpha * 0.6 });
    }
    for (const hoopY of [y + rect.height * 0.26, y + rect.height * 0.72]) {
      graphics
        .rect(x + 4, hoopY, rect.width - 8, 4)
        .fill({ color: METAL_DARK, alpha });
    }
    graphics
      .ellipse(rect.offsetX, y + 6, rect.width * 0.34, 4)
      .fill({ color: GOLD_LIGHT, alpha: alpha * 0.2 });
  }

  private drawBonePile(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    alpha: number,
    lineAlpha: number,
  ): void {
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

  private drawGoldPile(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    alpha: number,
    lineAlpha: number,
  ): void {
    const cx = rect.offsetX;
    const baseY = rect.offsetY + rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .ellipse(cx, baseY - h * 0.12, w * 0.48, h * 0.2)
      .fill({ color: GOLD_DARK, alpha: alpha * 0.55 });
    graphics
      .moveTo(cx - w * 0.5, baseY)
      .quadraticCurveTo(cx - w * 0.2, baseY - h * 1.0, cx, baseY - h * 0.62)
      .quadraticCurveTo(cx + w * 0.24, baseY - h * 1.05, cx + w * 0.5, baseY)
      .closePath()
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    for (const coin of [
      { dx: -w * 0.28, dy: -h * 0.12 },
      { dx: -w * 0.02, dy: -h * 0.32 },
      { dx: w * 0.26, dy: -h * 0.1 },
      { dx: w * 0.12, dy: -h * 0.02 },
    ]) {
      graphics
        .ellipse(cx + coin.dx, baseY + coin.dy, w * 0.12, h * 0.09)
        .fill({ color: GOLD_LIGHT, alpha })
        .stroke({ width: 1, color: GOLD_DARK, alpha: lineAlpha });
    }
    graphics
      .circle(cx - w * 0.04, baseY - h * 0.42, Math.max(2, w * 0.05))
      .fill({ color: 0x44d6ff, alpha });
    graphics
      .circle(cx + w * 0.2, baseY - h * 0.24, Math.max(2, w * 0.045))
      .fill({ color: 0xff5d7a, alpha });
  }

  private drawGoldenStatue(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    alpha: number,
    lineAlpha: number,
  ): void {
    const cx = rect.offsetX;
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .roundRect(x + w * 0.12, y + h * 0.82, w * 0.76, h * 0.16, 3)
      .fill({ color: GOLD_DARK, alpha })
      .stroke({ width: 2, color: 0x7c5a16, alpha: lineAlpha });
    graphics
      .circle(cx, y + h * 0.16, w * 0.18)
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    graphics
      .moveTo(cx, y + h * 0.3)
      .lineTo(cx - w * 0.26, y + h * 0.82)
      .lineTo(cx + w * 0.26, y + h * 0.82)
      .closePath()
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    for (const sign of [-1, 1]) {
      graphics
        .moveTo(cx + sign * w * 0.1, y + h * 0.36)
        .lineTo(cx + sign * w * 0.34, y + h * 0.58)
        .stroke({ width: Math.max(3, w * 0.08), color: GOLD, alpha });
    }
    graphics
      .rect(cx - w * 0.04, y + h * 0.08, w * 0.08, h * 0.74)
      .fill({ color: GOLD_LIGHT, alpha: alpha * 0.3 });
  }

  private drawWeaponRack(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .rect(x + 2, y + h * 0.62, w - 4, h * 0.3)
      .fill({ color: 0x7a5230, alpha })
      .stroke({ width: 2, color: WOOD_OUTLINE, alpha: lineAlpha });
    graphics
      .rect(x + 2, y + h * 0.2, w - 4, 5)
      .fill({ color: WOOD_DARK, alpha })
      .stroke({ width: 1.5, color: WOOD_OUTLINE, alpha: lineAlpha });
    for (const sign of [0, 1]) {
      graphics
        .rect(x + 3 + sign * (w - 8), y + h * 0.2, 5, h * 0.6)
        .fill({ color: WOOD_DARK, alpha });
    }
    const slots = [0.22, 0.42, 0.62, 0.82];
    slots.forEach((slot, index) => {
      const sx = x + w * slot;
      const topY = y + 1;
      const bottomY = y + h * 0.66;
      if (index % 2 === 0) {
        graphics
          .moveTo(sx, topY)
          .lineTo(sx, bottomY)
          .stroke({ width: 3, color: METAL, alpha });
        graphics
          .poly([sx - 4, topY + 4, sx, topY - 2, sx + 4, topY + 4])
          .fill({ color: METAL, alpha });
      } else {
        graphics
          .moveTo(sx, topY + 2)
          .lineTo(sx, bottomY)
          .stroke({ width: 3, color: 0x8a5a2b, alpha });
        graphics
          .poly([sx - 5, topY + 6, sx, topY, sx + 5, topY + 6])
          .fill({ color: METAL, alpha });
      }
    });
  }

  private drawThrone(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    alpha: number,
    lineAlpha: number,
  ): void {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    const cx = rect.offsetX;
    const w = rect.width;
    const h = rect.height;
    graphics
      .roundRect(x + w * 0.16, y + h * 0.08, w * 0.68, h * 0.78, 6)
      .fill({ color: 0x3a3a44, alpha })
      .stroke({ width: 2, color: 0x202026, alpha: lineAlpha });
    for (const sign of [-1, 1]) {
      graphics
        .roundRect(
          cx + sign * w * 0.4 - w * 0.08,
          y + h * 0.18,
          w * 0.16,
          h * 0.74,
          5,
        )
        .fill({ color: 0x4a4a55, alpha })
        .stroke({ width: 2, color: 0x202026, alpha: lineAlpha });
      graphics
        .poly([
          cx + sign * w * 0.4 - w * 0.05,
          y + h * 0.18,
          cx + sign * w * 0.4,
          y + h * 0.02,
          cx + sign * w * 0.4 + w * 0.05,
          y + h * 0.18,
        ])
        .fill({ color: GOLD_DARK, alpha });
    }
    graphics
      .roundRect(x + w * 0.24, y + h * 0.3, w * 0.52, h * 0.4, 5)
      .fill({ color: CUSHION, alpha })
      .stroke({ width: 1.5, color: 0x5a1014, alpha: lineAlpha });
    graphics
      .roundRect(x + w * 0.2, y + h * 0.66, w * 0.6, h * 0.2, 4)
      .fill({ color: CUSHION, alpha });
    graphics
      .rect(x + w * 0.24, y + h * 0.12, w * 0.52, 4)
      .fill({ color: GOLD, alpha });
    const skullR = w * 0.07;
    graphics
      .circle(cx, y + h * 0.2, skullR)
      .fill({ color: BONE, alpha })
      .stroke({ width: 1, color: BONE_DARK, alpha: lineAlpha });
    graphics
      .circle(cx - skullR * 0.4, y + h * 0.2, skullR * 0.25)
      .fill({ color: 0x26201c, alpha });
    graphics
      .circle(cx + skullR * 0.4, y + h * 0.2, skullR * 0.25)
      .fill({ color: 0x26201c, alpha });
  }

  private drawBlock(
    graphics: PIXI.Graphics,
    rect: DecorRect,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    graphics
      .roundRect(
        rect.offsetX - rect.width / 2,
        rect.offsetY - rect.height / 2,
        rect.width,
        rect.height,
        4,
      )
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: STONE_OUTLINE, alpha: lineAlpha });
  }
}

import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import * as PIXI from "pixi.js";

const LABEL_COLORS: Record<string, number> = {
  "Command Center": 0x37474f,
  "Military HQ": 0x37474f,
  Armory: 0x455a64,
  Barracks: 0x5d6b4a,
  "Vehicle Bay": 0x546e5a,
  "Guard Tower": 0x616161,
  Watchtower: 0x616161,
  House: 0xb08050,
  Farm: 0x7a9a52,
  Blacksmith: 0x7a5230,
  Clinic: 0xdde8ea,
  "Control Booth": 0x546e7a,
  "Supply Cache": 0x7a6248,
  Hangar: 0x4a5568,
};

const STROKE_COLORS: Record<string, number> = {
  "Command Center": 0x1a2a30,
  "Military HQ": 0x1a2a30,
  Armory: 0x1a2a30,
  Barracks: 0x2a3020,
  "Vehicle Bay": 0x1a3020,
  "Guard Tower": 0x303030,
  Watchtower: 0x303030,
  House: 0x5a3a18,
  Farm: 0x3a5018,
  Blacksmith: 0x3a2010,
  Clinic: 0x60a0b0,
  "Control Booth": 0x203038,
  "Supply Cache": 0x3a2a18,
  Hangar: 0x1a2030,
};

const DEFAULT_FILL = 0x607d8b;
const DEFAULT_STROKE = 0x263238;
const FLOORBOARD_BACKGROUND_PLUS_ONE_Z = -999_999_999;
const HOUSE_WALL_THICKNESS = 16;
const HOUSE_STRUCTURE_TYPE_IDS = new Set([
  "structure:house_s",
  "structure:house_m",
  "structure:house_l",
  "structure:house_xl",
  "structure:barracks",
  "structure:command_post",
]);

function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lightenColor(hex: number, amount: number): number {
  const r = Math.min(255, ((hex >> 16) & 0xff) + amount);
  const g = Math.min(255, ((hex >> 8) & 0xff) + amount);
  const b = Math.min(255, (hex & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

export class MapBuildingRenderer extends BaseEntityRenderer {
  private readonly floorGraphic: PIXI.Graphics;

  constructor(...args: ConstructorParameters<typeof BaseEntityRenderer>) {
    super(...args);
    this.floorGraphic = new PIXI.Graphics();
    const container = this.pixiRenderer.entityContainer;
    if (container) {
      container.addChild(this.floorGraphic);
    }
  }

  public override sync(
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    super.sync(entity, presentation);
    if (!HOUSE_STRUCTURE_TYPE_IDS.has(entity.typeId)) {
      this.floorGraphic.clear();
      return;
    }
    const fillColor = this.getFillColor(entity);
    const floorColor = lightenColor(fillColor, 45);
    const { minX, minY, width, height } = entity.hitboxBounds;
    const floorMinX = minX + HOUSE_WALL_THICKNESS;
    const floorMinY = minY + HOUSE_WALL_THICKNESS;
    const floorWidth = Math.max(0, width - HOUSE_WALL_THICKNESS * 2);
    const floorHeight = Math.max(0, height - HOUSE_WALL_THICKNESS * 2);
    this.floorGraphic.clear();
    this.floorGraphic
      .rect(
        Math.round(floorMinX),
        Math.round(floorMinY),
        Math.round(floorWidth),
        Math.round(floorHeight),
      )
      .fill({ color: floorColor, alpha: 1 });
    const visualX = presentation?.x ?? entity.x;
    const visualY = presentation?.y ?? entity.y;
    this.floorGraphic.position.set(visualX, visualY);
    this.floorGraphic.zIndex = FLOORBOARD_BACKGROUND_PLUS_ONE_Z;
  }

  public override destroy(): void {
    if (this.floorGraphic.parent) {
      this.floorGraphic.parent.removeChild(this.floorGraphic);
    }
    this.floorGraphic.destroy();
    super.destroy();
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    this.drawStaticFootprint(graphics, entity, fillColor, alpha, lineAlpha);
  }

  private drawStaticFootprint(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;
    const strokeColor = entity.label
      ? (STROKE_COLORS[entity.label] ?? DEFAULT_STROKE)
      : DEFAULT_STROKE;
    const floorColor = lightenColor(fillColor, 45);

    if (HOUSE_STRUCTURE_TYPE_IDS.has(entity.typeId)) {
      this.drawHouseFootprint(graphics, entity, fillColor, alpha);
      return;
    }

    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: floorColor, alpha: alpha * 0.45 });

    for (const rect of entity.hitboxes) {
      graphics
        .roundRect(
          rect.offsetX - rect.width / 2,
          rect.offsetY - rect.height / 2,
          rect.width,
          rect.height,
          3,
        )
        .fill({ color: darkenColor(fillColor, 0.62), alpha })
        .stroke({ width: 2, color: strokeColor, alpha: lineAlpha });
    }
  }

  private drawHouseFootprint(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
  ): void {
    const wallColor = darkenColor(fillColor, 0.62);

    for (const rect of entity.hitboxes) {
      const x = Math.round(rect.offsetX - rect.width / 2);
      const y = Math.round(rect.offsetY - rect.height / 2);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      graphics.rect(x, y, width, height).fill({ color: wallColor, alpha });
    }
  }

  protected getFillColor(entity: ClientEntity): number {
    if (entity.label) {
      const color = LABEL_COLORS[entity.label];
      if (color !== undefined) {
        return color;
      }
    }
    return DEFAULT_FILL;
  }
}

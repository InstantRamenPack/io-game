import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { isBlueprintItemTypeId } from "@shared/content/catalog.ts";
import type * as PIXI from "pixi.js";

export class PickupRenderer extends CircleEntityRenderer {
  private static readonly DEFAULT_PICKUP_COLOR = 0xd6e5d2;
  private static readonly BLUEPRINT_PICKUP_COLOR = 0x7ab6ff;

  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, PickupRenderer.DEFAULT_PICKUP_COLOR, options);
  }

  protected override drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    if (!this.isBlueprintPickup(entity)) {
      super.drawEntityShape(graphics, entity, fillColor, alpha, lineAlpha);
      return;
    }

    const sideLength = Math.max(
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
    );
    const halfSideLength = sideLength / 2;
    graphics.clear();
    graphics.roundRect(
      -halfSideLength,
      -halfSideLength,
      sideLength,
      sideLength,
      4,
    );
    graphics.fill({ color: fillColor, alpha: alpha * 0.55 });
    graphics.stroke({ width: 2, color: 0x000000, alpha: lineAlpha });
  }

  protected override getFillColor(entity: ClientEntity): number {
    if (this.isBlueprintPickup(entity)) {
      return PickupRenderer.BLUEPRINT_PICKUP_COLOR;
    }
    return PickupRenderer.DEFAULT_PICKUP_COLOR;
  }

  private isBlueprintPickup(entity: ClientEntity): boolean {
    const inventory = entity.inventory;
    if (!inventory) {
      return false;
    }

    if (
      inventory.resources.some((resource) =>
        isBlueprintItemTypeId(resource.typeId),
      )
    ) {
      return true;
    }

    return inventory.hotbarSlots.some((slot) => {
      if (slot.kind === "empty") {
        return false;
      }
      return isBlueprintItemTypeId(slot.typeId);
    });
  }
}

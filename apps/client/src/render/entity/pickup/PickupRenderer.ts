import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { syncItemIconSprite } from "@client/render/hud/itemIconRendering.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { InventorySlotSnapshot } from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Sprite, Text, TextStyle, Texture, type Graphics } from "pixi.js";

type PickupDisplay = {
  typeId: string;
  count: number;
};

export class PickupRenderer extends BaseEntityRenderer {
  private readonly itemSprite: Sprite;
  private readonly stackCountText: Text;

  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, options);
    this.itemSprite = new Sprite(Texture.EMPTY);
    this.itemSprite.anchor.set(0.5, 0.5);
    this.stackCountText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        fill: 0xf4f8ef,
        stroke: { color: 0x0c120b, width: 3 },
      }),
    });
    this.stackCountText.anchor.set(1, 1);
    this.entityContainer.addChild(this.itemSprite, this.stackCountText);
  }

  protected override drawEntityShape(
    graphics: Graphics,
    entity: ClientEntity,
    _fillColor: number,
    _alpha: number,
  ): void {
    const visualSize = Math.max(
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
    );
    const halfVisualSize = visualSize / 2;
    graphics.clear();
    graphics.roundRect(
      -halfVisualSize,
      -halfVisualSize,
      visualSize,
      visualSize,
      5,
    );
    graphics.fill({ color: 0x203126, alpha: 0.9 });
    graphics.stroke({ width: 2, color: 0x000000, alpha: 0.8 });

    const display = this.resolvePickupDisplay(entity);
    if (!display) {
      this.itemSprite.visible = false;
      this.stackCountText.visible = false;
      return;
    }

    const iconSize = Math.max(12, visualSize - 10);
    syncItemIconSprite({
      sprite: this.itemSprite,
      typeId: display.typeId as ResourceId,
      texture: this.pixiRenderer.getItemSpriteTexture(display.typeId),
      boxSize: iconSize,
      centerX: 0,
      centerY: 0,
    });

    this.stackCountText.visible = display.count > 1;
    this.stackCountText.text = String(display.count);
    this.stackCountText.position.set(halfVisualSize - 2, halfVisualSize - 2);
  }

  protected override getFillColor(entity: ClientEntity): number {
    if (this.resolvePickupDisplay(entity)?.count ?? 0 > 1) {
      return 0x9cc8a0;
    }
    return 0xd6e5d2;
  }

  private resolvePickupDisplay(entity: ClientEntity): PickupDisplay | null {
    const inventory = entity.inventory;
    if (!inventory) {
      return null;
    }

    for (const slot of inventory.hotbarSlots) {
      if (slot.kind === "empty") {
        continue;
      }
      return {
        typeId: slot.typeId,
        count: this.getSlotCount(slot),
      };
    }

    const resourceEntry = inventory.resources[0];
    if (resourceEntry && resourceEntry.amount > 0) {
      return {
        typeId: resourceEntry.typeId,
        count: resourceEntry.amount,
      };
    }

    return null;
  }

  private getSlotCount(
    slot: Exclude<InventorySlotSnapshot, { kind: "empty" }>,
  ): number {
    if (slot.kind === "buildable") {
      return slot.count;
    }
    return 1;
  }
}

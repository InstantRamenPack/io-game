import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import * as PIXI from "pixijs";

const PLAYER_RADIUS = 16;

export class PlayerRenderer extends CircleEntityRenderer {
  private readonly weaponContainer: PIXI.Container;
  private readonly weaponSprite: PIXI.Sprite;

  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, 0x67d944, options);

    this.weaponContainer = new PIXI.Container();
    this.weaponSprite = new PIXI.Sprite();
    this.weaponSprite.anchor.set(0.5, 0.8);
    // Position to the right side of the body (perpendicular to facing)
    this.weaponSprite.position.set(PLAYER_RADIUS + 6, PLAYER_RADIUS * 0.5);
    // Tilt slightly so it looks naturally held
    this.weaponSprite.rotation = Math.PI * 0.15;
    const scale = 44 / 410;
    this.weaponSprite.scale.set(scale);
    this.weaponSprite.visible = false;
    this.weaponContainer.addChild(this.weaponSprite);
    this.entityContainer.addChild(this.weaponContainer);
  }

  public override sync(entity: ClientEntity): void {
    super.sync(entity);
    this.weaponContainer.rotation = entity.rotation;

    const inv = entity.inventory;
    const activeWeapon =
      inv != null && inv.activeWeaponIndex != null
        ? inv.weapons[inv.activeWeaponIndex]
        : null;
    const isHoldingSword = activeWeapon?.typeId === "item:basic_sword";

    if (isHoldingSword && !this.weaponSprite.visible) {
      this.weaponSprite.texture = this.pixiRenderer.getItemTexture(
        "item:basic_sword",
      );
    }
    this.weaponSprite.visible = isHoldingSword;
  }
}

import * as PIXI from "pixi.js";
import type { CombatHudModel } from "@client/render/hud/hudPresentationModels.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";

const HEALTH_ROW_HEIGHT = 28;
const ARMOR_ROW_HEIGHT = 16;
const AMMO_ICON_SIZE = 14;
const AMMO_ICON_GAP = 4;
const AMMO_ROW_GAP = 6;

export class CombatHudView {
  public readonly container = new PIXI.Container();
  private readonly healthFrame = new PIXI.Graphics();
  private readonly healthTrack = new PIXI.Graphics();
  private readonly healthFill = new PIXI.Graphics();
  private readonly armorFrame = new PIXI.Graphics();
  private readonly armorIcons = new PIXI.Graphics();
  private readonly healthText: PIXI.Text;
  private readonly ammoFrame = new PIXI.Graphics();
  private readonly reserveText: PIXI.Text;
  private readonly ammoSprites: PIXI.Sprite[] = [];
  private readonly ammoTextureProvider: () => PIXI.Texture;
  private readonly armorText: PIXI.Text;
  private widthValue = 0;
  private heightValue = 0;

  constructor(options: { ammoTextureProvider: () => PIXI.Texture }) {
    this.ammoTextureProvider = options.ammoTextureProvider;
    const barTextStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 13,
      fill: 0xf3f6ee,
      stroke: { color: 0x0c120b, width: 3 },
    });
    this.healthText = new PIXI.Text({ text: "", style: barTextStyle });
    this.healthText.anchor.set(0.5);

    this.reserveText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 12,
        fill: 0xd9e3d0,
      }),
    });
    this.reserveText.anchor.set(1, 0.5);
    this.armorText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 10,
        fill: 0xcfd9ea,
      }),
    });
    this.armorText.anchor.set(0, 0.5);

    this.container.addChild(
      this.healthFrame,
      this.healthTrack,
      this.healthFill,
      this.armorFrame,
      this.armorIcons,
      this.ammoFrame,
      this.healthText,
      this.reserveText,
      this.armorText,
    );
  }

  public sync(model: CombatHudModel | null, width: number): void {
    this.widthValue = Math.max(0, Math.floor(width));
    this.heightValue = 0;
    this.container.visible = Boolean(model) && this.widthValue > 0;
    if (!model || this.widthValue <= 0) {
      this.hideAmmoSprites();
      return;
    }

    const padding = 8;
    this.heightValue = HEALTH_ROW_HEIGHT;

    if (!model.ammo) {
      this.drawArmorRow(model, 0, this.widthValue, padding);
      this.drawHealthRow(
        model.hp,
        model.maxHp,
        ARMOR_ROW_HEIGHT + 4,
        this.widthValue,
        padding,
      );
      this.heightValue = ARMOR_ROW_HEIGHT + 4 + HEALTH_ROW_HEIGHT;
      this.ammoFrame.clear();
      this.reserveText.text = "";
      this.hideAmmoSprites();
      return;
    }

    const reserveBlockWidth = 72;
    const ammoInnerWidth = Math.max(
      1,
      this.widthValue - padding * 2 - reserveBlockWidth - 12,
    );
    const iconsPerRow = Math.max(
      1,
      Math.floor(
        (ammoInnerWidth + AMMO_ICON_GAP) / (AMMO_ICON_SIZE + AMMO_ICON_GAP),
      ),
    );
    const rows = Math.max(1, Math.ceil(model.ammo.magSize / iconsPerRow));
    const ammoHeight =
      padding * 2 + rows * AMMO_ICON_SIZE + (rows - 1) * AMMO_ROW_GAP;
    const ammoY = 0;
    const armorY = ammoHeight + 6;
    const healthY = armorY + ARMOR_ROW_HEIGHT + 4;
    this.heightValue = healthY + HEALTH_ROW_HEIGHT;

    drawRoundedRect(
      this.ammoFrame,
      0,
      ammoY,
      this.widthValue,
      ammoHeight,
      10,
      { color: 0x101512, alpha: 0.86 },
      { width: 1, color: 0x4f5d51, alpha: 0.55 },
    );

    this.reserveText.text =
      model.ammo.reserveMagCount !== null
        ? `Mags ${model.ammo.reserveMagCount}`
        : "";
    this.reserveText.position.set(
      this.widthValue - padding,
      ammoY + ammoHeight / 2,
    );

    const iconStartX = padding;
    const iconTopY = ammoY + padding;
    const texture = this.ammoTextureProvider();
    this.ensureAmmoSpriteCount(model.ammo.magSize);

    for (let index = 0; index < this.ammoSprites.length; index += 1) {
      const sprite = this.ammoSprites[index];
      if (!sprite) {
        continue;
      }
      sprite.visible = index < model.ammo.magSize;
      if (!sprite.visible) {
        continue;
      }
      sprite.texture = texture;
      sprite.width = AMMO_ICON_SIZE;
      sprite.height = AMMO_ICON_SIZE;
      const row = Math.floor(index / iconsPerRow);
      const column = index % iconsPerRow;
      sprite.position.set(
        iconStartX + column * (AMMO_ICON_SIZE + AMMO_ICON_GAP),
        iconTopY + row * (AMMO_ICON_SIZE + AMMO_ROW_GAP),
      );
      sprite.tint = index < model.ammo.ammoInMag ? 0xffe087 : 0x5f6461;
      sprite.alpha = index < model.ammo.ammoInMag ? 0.98 : 0.5;
    }

    this.drawArmorRow(model, armorY, this.widthValue, padding);
    this.drawHealthRow(
      model.hp,
      model.maxHp,
      healthY,
      this.widthValue,
      padding,
    );
  }

  public setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  public get width(): number {
    return this.widthValue;
  }

  public get height(): number {
    return this.heightValue;
  }

  private drawHealthRow(
    hp: number,
    maxHp: number,
    y: number,
    width: number,
    padding: number,
  ): void {
    drawRoundedRect(
      this.healthFrame,
      0,
      y,
      width,
      HEALTH_ROW_HEIGHT,
      10,
      { color: 0x121915, alpha: 0.9 },
      { width: 1, color: 0x61735b, alpha: 0.65 },
    );

    const trackY = y + 7;
    const trackWidth = width - padding * 2;
    const trackHeight = 14;

    const hpRatio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    drawRoundedRect(
      this.healthTrack,
      padding,
      trackY,
      trackWidth,
      trackHeight,
      7,
      { color: 0x261d1d, alpha: 0.95 },
    );
    drawRoundedRect(
      this.healthFill,
      padding,
      trackY,
      Math.max(0, trackWidth * hpRatio),
      trackHeight,
      7,
      { color: 0xb44646, alpha: 0.96 },
    );
    this.healthText.text = `${Math.max(0, Math.round(hp))}/${Math.max(0, Math.round(maxHp))}`;
    this.healthText.position.set(
      padding + trackWidth / 2,
      y + HEALTH_ROW_HEIGHT / 2,
    );
  }

  private drawArmorRow(
    model: CombatHudModel,
    y: number,
    width: number,
    padding: number,
  ): void {
    const iconCount = 10;
    const spacing = 3;
    const iconSize = 8;
    const iconsWidth = iconCount * iconSize + (iconCount - 1) * spacing;
    const filled = Math.round(
      (model.armorDamageReductionPct / 0.35) * iconCount,
    );
    this.armorFrame.clear();
    this.armorFrame.roundRect(0, y, width, ARMOR_ROW_HEIGHT, 8).fill({
      color: 0x10131f,
      alpha: 0.82,
    });

    this.armorIcons.clear();
    const iconsStartX = padding;
    for (let index = 0; index < iconCount; index += 1) {
      const x = iconsStartX + index * (iconSize + spacing);
      const color =
        model.armorTier === 4
          ? index < filled
            ? 0xf4c86b
            : 0x4e4738
          : index < filled
            ? 0x7fa8ff
            : 0x3a4356;
      this.armorIcons
        .roundRect(x, y + 4, iconSize, iconSize, 2)
        .fill({ color, alpha: 0.95 });
    }
    this.armorText.text =
      model.armorTier === null
        ? "No armor"
        : `T${model.armorTier}  ${Math.round(model.armorDamageReductionPct * 100)}%`;
    this.armorText.position.set(
      Math.min(width - 90, iconsStartX + iconsWidth + 10),
      y + ARMOR_ROW_HEIGHT / 2,
    );
  }

  private ensureAmmoSpriteCount(count: number): void {
    while (this.ammoSprites.length < count) {
      const sprite = new PIXI.Sprite(this.ammoTextureProvider());
      this.ammoSprites.push(sprite);
      this.container.addChild(sprite);
    }
  }

  private hideAmmoSprites(): void {
    for (const sprite of this.ammoSprites) {
      sprite.visible = false;
    }
  }
}

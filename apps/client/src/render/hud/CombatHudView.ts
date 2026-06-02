import * as PIXI from "pixi.js";
import type { CombatHudModel } from "@client/render/hud/hudPresentationModels.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { EFFECTIVE_HEALTH_INCREASE_PER_ARMOR_BAR } from "@shared/gameplay/rules/armorRules.ts";

const HEALTH_ROW_HEIGHT = 28;
const COMBAT_ROW_HEIGHT = 30;
const ROW_GAP = 6;
const PAD_X = 10;
const ARMOR_ICON_SIZE = 20;
const ARMOR_ICON_GAP = 4;
const AMMO_ICON_WIDTH = 8;
const AMMO_ICON_HEIGHT = 20;
const AMMO_TEXT_GAP = 8;

export class CombatHudView {
  public readonly container = new PIXI.Container();
  private readonly healthFrame = new PIXI.Graphics();
  private readonly healthTrack = new PIXI.Graphics();
  private readonly healthFill = new PIXI.Graphics();
  private readonly combatRowFrame = new PIXI.Graphics();
  private readonly healthText: PIXI.Text;
  private readonly ammoSprites: PIXI.Sprite[] = [];
  private readonly armorSprites: PIXI.Sprite[] = [];
  private readonly ammoFilledTextureProvider: () => PIXI.Texture;
  private readonly armorFilledTextureProvider: () => PIXI.Texture;
  private readonly armorEmptyTextureProvider: () => PIXI.Texture;
  private readonly ammoCountText: PIXI.Text;
  private widthValue = 0;
  private heightValue = 0;

  constructor(options: {
    ammoFilledTextureProvider: () => PIXI.Texture;
    armorFilledTextureProvider: () => PIXI.Texture;
    armorEmptyTextureProvider: () => PIXI.Texture;
  }) {
    this.ammoFilledTextureProvider = options.ammoFilledTextureProvider;
    this.armorFilledTextureProvider = options.armorFilledTextureProvider;
    this.armorEmptyTextureProvider = options.armorEmptyTextureProvider;

    this.healthText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 13,
        fill: 0xf3f6ee,
        stroke: { color: 0x0c120b, width: 3 },
      }),
    });
    this.healthText.anchor.set(0.5);

    this.ammoCountText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 16,
        fill: 0xf3f6ee,
        stroke: { color: 0x0c120b, width: 3 },
      }),
    });
    this.ammoCountText.anchor.set(0, 0.5);
    this.ammoCountText.visible = false;

    this.container.addChild(
      this.combatRowFrame,
      this.healthFrame,
      this.healthTrack,
      this.healthFill,
      this.healthText,
      this.ammoCountText,
    );
  }

  public sync(model: CombatHudModel | null, width: number): void {
    this.widthValue = Math.max(0, Math.floor(width));
    this.heightValue = 0;
    this.container.visible = Boolean(model) && this.widthValue > 0;
    if (!model || this.widthValue <= 0) {
      this.hideAmmoSprites();
      this.hideArmorSprites();
      this.ammoCountText.visible = false;
      return;
    }

    this.drawCombatRow(model);
    this.drawHealthRow(model.hp, model.maxHp, COMBAT_ROW_HEIGHT + ROW_GAP);
    this.heightValue = COMBAT_ROW_HEIGHT + ROW_GAP + HEALTH_ROW_HEIGHT;
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

  private drawCombatRow(model: CombatHudModel): void {
    drawRoundedRect(
      this.combatRowFrame,
      0,
      0,
      this.widthValue,
      COMBAT_ROW_HEIGHT,
      10,
      { color: 0x131720, alpha: 0.84 },
      { width: 1, color: 0x59606b, alpha: 0.65 },
    );

    this.drawAmmoAndMags(model);
    this.drawArmor(model);
  }

  private drawAmmoAndMags(model: CombatHudModel): void {
    const ammo = model.ammo;
    if (!ammo) {
      this.hideAmmoSprites();
      this.ammoCountText.visible = false;
      return;
    }

    this.ensureAmmoSpriteCount(1);
    const bulletStartX = PAD_X;
    for (let i = 0; i < this.ammoSprites.length; i += 1) {
      const sprite = this.ammoSprites[i];
      if (!sprite) continue;
      sprite.visible = i === 0;
      if (!sprite.visible) continue;
      sprite.texture = this.ammoFilledTextureProvider();
      sprite.width = AMMO_ICON_WIDTH;
      sprite.height = AMMO_ICON_HEIGHT;
      sprite.position.set(
        bulletStartX,
        Math.floor((COMBAT_ROW_HEIGHT - AMMO_ICON_HEIGHT) / 2),
      );
      sprite.alpha = 0.98;
    }

    this.ammoCountText.text =
      `${Math.max(0, ammo.ammoInMag)} / ${Math.max(0, ammo.totalAmmo)}`;
    this.ammoCountText.position.set(
      bulletStartX + AMMO_ICON_WIDTH + AMMO_TEXT_GAP,
      COMBAT_ROW_HEIGHT / 2,
    );
    this.ammoCountText.visible = true;
  }

  private drawArmor(model: CombatHudModel): void {
    const armorSlots = 10;
    const armorBars = model.armorDamageReductionPct
      ? (1 / (1 - model.armorDamageReductionPct) - 1) /
        EFFECTIVE_HEALTH_INCREASE_PER_ARMOR_BAR
      : 0;
    const armorFilled = Math.max(
      0,
      Math.min(armorSlots, Math.round(armorBars)),
    );
    this.ensureArmorSpriteCount(armorSlots);
    const totalArmorWidth =
      armorSlots * ARMOR_ICON_SIZE +
      Math.max(0, armorSlots - 1) * ARMOR_ICON_GAP;
    const armorStartX = this.widthValue - PAD_X - totalArmorWidth;
    for (let i = 0; i < armorSlots; i += 1) {
      const sprite = this.armorSprites[i];
      if (!sprite) continue;
      sprite.visible = true;
      sprite.texture =
        i < armorFilled
          ? this.armorFilledTextureProvider()
          : this.armorEmptyTextureProvider();
      sprite.width = ARMOR_ICON_SIZE;
      sprite.height = ARMOR_ICON_SIZE;
      sprite.position.set(
        armorStartX + i * (ARMOR_ICON_SIZE + ARMOR_ICON_GAP),
        Math.floor((COMBAT_ROW_HEIGHT - ARMOR_ICON_SIZE) / 2),
      );
      sprite.alpha = i < armorFilled ? 0.98 : 0.65;
    }
  }

  private drawHealthRow(hp: number, maxHp: number, y: number): void {
    drawRoundedRect(
      this.healthFrame,
      0,
      y,
      this.widthValue,
      HEALTH_ROW_HEIGHT,
      10,
      { color: 0x121915, alpha: 0.9 },
      { width: 1, color: 0x61735b, alpha: 0.65 },
    );

    const trackY = y + 7;
    const trackWidth = this.widthValue - PAD_X * 2;
    const trackHeight = 14;
    const hpRatio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));

    drawRoundedRect(
      this.healthTrack,
      PAD_X,
      trackY,
      trackWidth,
      trackHeight,
      7,
      {
        color: 0x261d1d,
        alpha: 0.95,
      },
    );
    drawRoundedRect(
      this.healthFill,
      PAD_X,
      trackY,
      Math.max(0, trackWidth * hpRatio),
      trackHeight,
      7,
      { color: 0xb44646, alpha: 0.96 },
    );
    this.healthText.text = `${Math.max(0, Math.round(hp))}/${Math.max(0, Math.round(maxHp))}`;
    this.healthText.position.set(
      PAD_X + trackWidth / 2,
      y + HEALTH_ROW_HEIGHT / 2,
    );
  }

  private ensureAmmoSpriteCount(count: number): void {
    while (this.ammoSprites.length < count) {
      const sprite = new PIXI.Sprite(this.ammoFilledTextureProvider());
      this.ammoSprites.push(sprite);
      this.container.addChild(sprite);
    }
    for (let i = count; i < this.ammoSprites.length; i += 1) {
      const sprite = this.ammoSprites[i];
      if (sprite) sprite.visible = false;
    }
  }

  private ensureArmorSpriteCount(count: number): void {
    while (this.armorSprites.length < count) {
      const sprite = new PIXI.Sprite(this.armorEmptyTextureProvider());
      this.armorSprites.push(sprite);
      this.container.addChild(sprite);
    }
    for (let i = count; i < this.armorSprites.length; i += 1) {
      const sprite = this.armorSprites[i];
      if (sprite) sprite.visible = false;
    }
  }

  private hideAmmoSprites(): void {
    for (const sprite of this.ammoSprites) sprite.visible = false;
  }

  private hideArmorSprites(): void {
    for (const sprite of this.armorSprites) sprite.visible = false;
  }
}

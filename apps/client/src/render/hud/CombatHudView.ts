import * as PIXI from "pixi.js";
import type { CombatHudModel } from "@client/render/hud/hudPresentationModels.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";

const HEALTH_ROW_HEIGHT = 28;
const AMMO_ICON_SIZE = 14;
const AMMO_ICON_GAP = 4;
const AMMO_ROW_GAP = 6;

export class CombatHudView {
  public readonly container = new PIXI.Container();
  private readonly healthFrame = new PIXI.Graphics();
  private readonly healthTrack = new PIXI.Graphics();
  private readonly healthFill = new PIXI.Graphics();
  private readonly healthText: PIXI.Text;
  private readonly ammoFrame = new PIXI.Graphics();
  private readonly reserveText: PIXI.Text;
  private readonly ammoSprites: PIXI.Sprite[] = [];
  private readonly ammoTextureProvider: () => PIXI.Texture;
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

    this.container.addChild(
      this.healthFrame,
      this.healthTrack,
      this.healthFill,
      this.ammoFrame,
      this.healthText,
      this.reserveText,
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

    this.ammoFrame.clear();
    this.reserveText.text = "";
    this.hideAmmoSprites();

    this.drawHealthRow(model.hp, model.maxHp, 0, this.widthValue, padding);
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
    this.healthText.position.set(padding + trackWidth / 2, y + HEALTH_ROW_HEIGHT / 2);
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

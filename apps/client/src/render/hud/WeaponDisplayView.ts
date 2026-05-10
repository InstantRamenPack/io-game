import * as PIXI from "pixi.js";

export type WeaponDisplayModel = {
  name: string;
  ammo: { inMag: number; reserve: number } | null;
} | null;

export class WeaponDisplayView {
  public readonly container = new PIXI.Container();
  private readonly bg = new PIXI.Graphics();
  private readonly nameText: PIXI.Text;
  private readonly ammoInMagText: PIXI.Text;
  private readonly ammoSepText: PIXI.Text;
  private readonly ammoReserveText: PIXI.Text;
  private widthValue = 0;
  private heightValue = 0;

  constructor() {
    this.nameText = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 18,
        fill: 0xb8cdb4,
        letterSpacing: 1,
      }),
    );
    this.nameText.anchor.set(1, 1);

    this.ammoInMagText = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 56,
        fill: 0xf0f5ee,
        fontWeight: "bold",
      }),
    );
    this.ammoInMagText.anchor.set(1, 1);

    this.ammoSepText = new PIXI.Text(
      "/",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 30,
        fill: 0x5a6a56,
      }),
    );
    this.ammoSepText.anchor.set(0.5, 1);

    this.ammoReserveText = new PIXI.Text(
      "",
      new PIXI.TextStyle({
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 34,
        fill: 0x7a9474,
      }),
    );
    this.ammoReserveText.anchor.set(0, 1);

    this.container.addChild(
      this.bg,
      this.ammoInMagText,
      this.ammoSepText,
      this.ammoReserveText,
      this.nameText,
    );
    this.container.visible = false;
  }

  public sync(model: WeaponDisplayModel): void {
    if (!model) {
      this.container.visible = false;
      this.widthValue = 0;
      this.heightValue = 0;
      return;
    }

    this.container.visible = true;
    const paddingX = 20;
    const paddingY = 14;
    const nameAmmoGap = 6;

    this.nameText.text = model.name;

    if (model.ammo) {
      this.ammoInMagText.visible = true;
      this.ammoSepText.visible = true;
      this.ammoReserveText.visible = true;

      this.ammoInMagText.text = String(model.ammo.inMag);
      this.ammoReserveText.text = String(model.ammo.reserve);

      const sepPad = 5;
      const ammoRowHeight = Math.max(
        this.ammoInMagText.height,
        this.ammoReserveText.height,
        this.ammoSepText.height,
      );
      const ammoRowWidth =
        this.ammoInMagText.width +
        sepPad +
        this.ammoSepText.width +
        sepPad +
        this.ammoReserveText.width;

      const contentWidth = Math.max(ammoRowWidth, this.nameText.width);
      this.widthValue = Math.ceil(contentWidth + paddingX * 2);
      this.heightValue = Math.ceil(
        paddingY + ammoRowHeight + nameAmmoGap + this.nameText.height + paddingY,
      );

      const right = this.widthValue - paddingX;
      const nameY = this.heightValue - paddingY;
      const ammoY = nameY - this.nameText.height - nameAmmoGap;

      this.nameText.position.set(right, nameY);

      const ammoLeft = right - ammoRowWidth;
      this.ammoInMagText.position.set(
        ammoLeft + this.ammoInMagText.width,
        ammoY,
      );
      this.ammoSepText.position.set(
        ammoLeft + this.ammoInMagText.width + sepPad + this.ammoSepText.width / 2,
        ammoY,
      );
      this.ammoReserveText.position.set(
        ammoLeft + this.ammoInMagText.width + sepPad + this.ammoSepText.width + sepPad,
        ammoY,
      );
    } else {
      this.ammoInMagText.visible = false;
      this.ammoSepText.visible = false;
      this.ammoReserveText.visible = false;

      this.widthValue = Math.ceil(this.nameText.width + paddingX * 2);
      this.heightValue = Math.ceil(this.nameText.height + paddingY * 2);

      const right = this.widthValue - paddingX;
      const nameY = this.heightValue - paddingY;
      this.nameText.position.set(right, nameY);
    }

    this.bg.clear();
    this.bg
      .roundRect(0, 0, this.widthValue, this.heightValue, 8)
      .fill({ color: 0x0a0f0b, alpha: 0.72 });
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
}

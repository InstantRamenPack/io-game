import * as PIXI from "pixi.js";

const BAR_WIDTH = 420;
const BAR_HEIGHT = 18;
const LABEL_FONT: Partial<PIXI.TextStyle> = {
  fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
  fontSize: 13,
  fill: 0xd7bde2,
  fontWeight: "bold",
  letterSpacing: 1.5,
};
const HP_FONT: Partial<PIXI.TextStyle> = {
  fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
  fontSize: 11,
  fill: 0xe8e8e8,
};

export class BossHealthBar {
  public readonly container: PIXI.Container;
  private readonly bg: PIXI.Graphics;
  private readonly track: PIXI.Graphics;
  private readonly fill: PIXI.Graphics;
  private readonly label: PIXI.Text;
  private readonly hpText: PIXI.Text;

  constructor() {
    this.container = new PIXI.Container();
    this.bg = new PIXI.Graphics();
    this.track = new PIXI.Graphics();
    this.fill = new PIXI.Graphics();
    this.label = new PIXI.Text("⚡ THANOS", new PIXI.TextStyle(LABEL_FONT));
    this.hpText = new PIXI.Text("", new PIXI.TextStyle(HP_FONT));
    this.label.anchor.set(0.5, 1);
    this.hpText.anchor.set(0.5, 0);

    this.container.addChild(this.bg, this.track, this.fill, this.label, this.hpText);
    this.container.visible = false;
  }

  public sync(options: {
    hp: number;
    maxHp: number;
    visible: boolean;
    screenWidth: number;
    screenHeight: number;
  }): void {
    const { hp, maxHp, visible, screenWidth, screenHeight } = options;
    this.container.visible = visible;
    if (!visible) return;

    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    const cx = Math.floor(screenWidth / 2);
    const top = 24;

    this.bg.clear();
    this.bg
      .roundRect(-BAR_WIDTH / 2 - 12, -24, BAR_WIDTH + 24, BAR_HEIGHT + 44, 8)
      .fill({ color: 0x0a0a0a, alpha: 0.72 })
      .roundRect(-BAR_WIDTH / 2 - 12, -24, BAR_WIDTH + 24, BAR_HEIGHT + 44, 8)
      .stroke({ width: 1.5, color: 0x7d3c98, alpha: 0.8 });

    this.track.clear();
    this.track
      .roundRect(-BAR_WIDTH / 2, 0, BAR_WIDTH, BAR_HEIGHT, 4)
      .fill({ color: 0x1a1a1a, alpha: 0.9 });

    this.fill.clear();
    if (ratio > 0) {
      this.fill
        .roundRect(-BAR_WIDTH / 2, 0, BAR_WIDTH * ratio, BAR_HEIGHT, 4)
        .fill({ color: 0x8e44ad, alpha: 1 });
    }

    this.label.position.set(0, -4);
    this.hpText.text = `${Math.ceil(hp)} / ${maxHp}`;
    this.hpText.position.set(0, BAR_HEIGHT + 4);

    this.container.position.set(cx, top);
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

import * as PIXI from "pixi.js";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { ChatMessage } from "@shared/net/protocol.ts";

type ChatMessageEntry = {
  message: ChatMessage;
  createdAt: number;
  view: ChatLineView;
};

const MAX_HISTORY = 200;
const MAX_VISIBLE_CLOSED = 8;
const FADE_AFTER_MS = 8000;
const REMOVE_AFTER_MS = 12000;
const LINE_GAP = 4;
const MARGIN_LEFT = 18;
const MARGIN_BOTTOM = 18;
const DEFAULT_INPUT_ROW_HEIGHT = 34;
const DEFAULT_INPUT_ROW_GAP = 6;

class ChatLineView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly text: PIXI.Text;
  private readonly textResolution: number;
  private readonly paddingX = 6;
  private readonly paddingY = 3;
  private readonly borderWidth = 3;
  private readonly borderColor = 0xffffff;
  private readonly borderAlpha = 0.25;
  private readonly backgroundColor = 0x000000;
  private readonly backgroundAlpha = 0.45;
  private widthValue = 0;
  private heightValue = 0;

  constructor(message: ChatMessage, style: PIXI.TextStyle) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.text = new PIXI.Text(message.text, style);
    this.textResolution = Math.max(1, Math.round(window.devicePixelRatio || 1));
    this.text.resolution = this.textResolution;
    this.container.addChild(this.background);
    this.container.addChild(this.text);
    this.layout();
  }

  public setWrapWidth(maxWidth: number): void {
    const wrapWidth = Math.max(
      0,
      maxWidth - this.borderWidth - this.paddingX * 2,
    );
    this.text.style.wordWrap = true;
    this.text.style.wordWrapWidth = wrapWidth;
    this.layout();
  }

  public setTextStyle(style: PIXI.TextStyle): void {
    this.text.style = style;
    this.text.resolution = this.textResolution;
    this.layout();
  }

  public layout(): void {
    const textX = this.borderWidth + this.paddingX;
    const textY = this.paddingY;
    this.text.position.set(Math.round(textX), Math.round(textY));

    const contentWidth = Math.ceil(this.text.width);
    const contentHeight = Math.ceil(this.text.height);
    this.widthValue = Math.ceil(
      contentWidth + this.paddingX * 2 + this.borderWidth,
    );
    this.heightValue = Math.ceil(contentHeight + this.paddingY * 2);

    this.background.clear();
    this.background
      .roundRect(0, 0, this.widthValue, this.heightValue, 4)
      .fill({ color: this.backgroundColor, alpha: this.backgroundAlpha })
      .rect(0, 0, this.borderWidth, this.heightValue)
      .fill({ color: this.borderColor, alpha: this.borderAlpha });
  }

  public get width(): number {
    return this.widthValue;
  }

  public get height(): number {
    return this.heightValue;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

export class PixiChat {
  private root: PIXI.Container | null = null;
  private linesContainer: PIXI.Container | null = null;
  private maskGraphic: PIXI.Graphics | null = null;
  private entries: ChatMessageEntry[] = [];
  private visible = false;
  private open = false;
  private dirty = true;
  private lastScreenWidth = 0;
  private lastScreenHeight = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  private contentHeight = 0;
  private scrollOffset = 0;
  private maxScroll = 0;
  private stickToBottom = true;
  private inputRowHeight = DEFAULT_INPUT_ROW_HEIGHT;
  private inputRowGap = DEFAULT_INPUT_ROW_GAP;
  private readonly hitArea = { x: 0, y: 0, width: 0, height: 0 };
  private readonly baseTextStyle = new PIXI.TextStyle({
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    fontSize: 14,
    fill: 0xf4f4f4,
    lineHeight: 19,
    wordWrap: true,
    breakWords: true,
    dropShadow: {
      color: 0x000000,
      distance: 1,
      blur: 0,
    },
    stroke: { color: 0x000000, width: 2 },
  });

  public attach(app: PIXI.Application): void {
    if (!this.root) {
      this.root = new PIXI.Container();
      this.linesContainer = new PIXI.Container();
      this.maskGraphic = new PIXI.Graphics();
      this.root.addChild(this.maskGraphic);
      this.root.addChild(this.linesContainer);
      this.linesContainer.mask = this.maskGraphic;
      for (const entry of this.entries) {
        this.linesContainer.addChild(entry.view.container);
      }
    }

    if (this.root.parent !== app.stage) {
      app.stage.addChild(this.root);
    }

    this.root.visible = this.visible;
    this.markDirty();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.root) {
      this.root.visible = visible;
    }
    this.markDirty();
  }

  public setOpen(open: boolean): void {
    if (this.open === open) {
      return;
    }
    this.open = open;
    this.scrollOffset = 0;
    this.stickToBottom = true;
    this.markDirty();
  }

  public setInputRowHeight(height: number, gap: number): void {
    if (Number.isFinite(height) && height >= 0) {
      this.inputRowHeight = Math.round(height);
    }
    if (Number.isFinite(gap) && gap >= 0) {
      this.inputRowGap = Math.round(gap);
    }
    this.markDirty();
  }

  public pushLine(message: ChatMessage): void {
    const view = new ChatLineView(message, this.getStyleForMessage(message));
    this.entries.push({
      message,
      createdAt: Date.now(),
      view,
    });
    if (this.linesContainer) {
      this.linesContainer.addChild(view.container);
    }

    if (this.entries.length > MAX_HISTORY) {
      const removed = this.entries.shift();
      if (removed) {
        removed.view.container.removeFromParent();
        removed.view.destroy();
      }
    }

    this.stickToBottom = this.open && this.scrollOffset <= 4;
    this.markDirty();
  }

  public containsPoint(localX: number, localY: number): boolean {
    return (
      localX >= this.hitArea.x &&
      localX <= this.hitArea.x + this.hitArea.width &&
      localY >= this.hitArea.y &&
      localY <= this.hitArea.y + this.hitArea.height
    );
  }

  public scrollBy(deltaY: number): boolean {
    if (!this.open || this.maxScroll <= 0) {
      return false;
    }
    const nextOffset = this.clamp(
      this.scrollOffset - deltaY,
      0,
      this.maxScroll,
    );
    if (nextOffset === this.scrollOffset) {
      return false;
    }
    this.scrollOffset = nextOffset;
    this.stickToBottom = this.scrollOffset <= 1;
    this.applyScrollPosition();
    return true;
  }

  public render(app: PIXI.Application, force = false): void {
    if (!this.root || !this.linesContainer || !this.maskGraphic) {
      return;
    }

    if (!this.visible) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    const sizeChanged =
      app.screen.width !== this.lastScreenWidth ||
      app.screen.height !== this.lastScreenHeight;

    if (this.dirty || force || sizeChanged) {
      this.lastScreenWidth = app.screen.width;
      this.lastScreenHeight = app.screen.height;
      this.layout(app.screen.width, app.screen.height);
      this.dirty = false;
    }

    this.syncLineAlphas();
  }

  private layout(screenWidth: number, screenHeight: number): void {
    if (!this.root || !this.linesContainer || !this.maskGraphic) {
      return;
    }

    const maxWidth = this.computeMaxWidth(screenWidth);
    this.viewWidth = maxWidth;
    this.layoutLines(maxWidth);

    const openHeight = this.computeOpenHeight(screenHeight);
    const closedHeight = this.computeClosedHeight(openHeight);
    this.viewHeight = this.open ? openHeight : closedHeight;

    const originX = MARGIN_LEFT;
    const originY =
      screenHeight -
      MARGIN_BOTTOM -
      this.inputRowHeight -
      this.inputRowGap -
      this.viewHeight;
    this.root.position.set(Math.round(originX), Math.round(originY));

    drawRect(this.maskGraphic, 0, 0, this.viewWidth, this.viewHeight, {
      color: 0xffffff,
      alpha: 1,
    });

    this.maxScroll = Math.max(0, this.contentHeight - this.viewHeight);
    if (!this.open) {
      this.scrollOffset = 0;
      this.stickToBottom = true;
    } else if (this.stickToBottom) {
      this.scrollOffset = 0;
    } else {
      this.scrollOffset = this.clamp(this.scrollOffset, 0, this.maxScroll);
    }
    this.applyScrollPosition();
    this.stickToBottom = false;

    this.hitArea.x = originX;
    this.hitArea.y = originY;
    this.hitArea.width = this.viewWidth;
    this.hitArea.height = this.viewHeight;
  }

  private layoutLines(maxWidth: number): void {
    let y = 0;
    for (const entry of this.entries) {
      const view = entry.view;
      view.setWrapWidth(maxWidth);
      view.container.position.set(0, y);
      y += view.height + LINE_GAP;
    }
    this.contentHeight = Math.max(0, y - LINE_GAP);
  }

  private applyScrollPosition(): void {
    if (!this.linesContainer) {
      return;
    }
    const baseOffset = this.viewHeight - this.contentHeight;
    this.linesContainer.position.set(0, baseOffset + this.scrollOffset);
  }

  private syncLineAlphas(): void {
    const now = Date.now();
    for (const entry of this.entries) {
      if (this.open) {
        entry.view.container.alpha = 1;
        continue;
      }
      const age = now - entry.createdAt;
      if (age >= REMOVE_AFTER_MS) {
        entry.view.container.alpha = 0;
      } else if (age > FADE_AFTER_MS) {
        const fadeProgress =
          (age - FADE_AFTER_MS) / (REMOVE_AFTER_MS - FADE_AFTER_MS);
        entry.view.container.alpha = this.clamp(1 - fadeProgress, 0, 1);
      } else {
        entry.view.container.alpha = 1;
      }
    }
  }

  private computeMaxWidth(screenWidth: number): number {
    if (screenWidth <= 640) {
      return Math.round(screenWidth * 0.9);
    }
    if (screenWidth <= 980) {
      return Math.round(Math.min(screenWidth * 0.78, 440));
    }
    return Math.round(Math.min(screenWidth * 0.38, 420));
  }

  private computeOpenHeight(screenHeight: number): number {
    return Math.round(Math.min(320, Math.max(180, screenHeight * 0.32)));
  }

  private computeClosedHeight(openHeight: number): number {
    const recent = this.entries.slice(-MAX_VISIBLE_CLOSED);
    if (recent.length === 0) {
      return 0;
    }
    let height = 0;
    for (const entry of recent) {
      height += entry.view.height;
    }
    height += LINE_GAP * Math.max(0, recent.length - 1);
    return Math.min(openHeight, height);
  }

  private getStyleForMessage(message: ChatMessage): PIXI.TextStyle {
    const style = this.baseTextStyle.clone();
    switch (message.kind) {
      case "system":
        style.fill = 0xffd6a0;
        break;
      case "emote":
        style.fill = 0xb9f2c2;
        style.fontStyle = "italic";
        break;
      case "whisper":
        style.fill = 0xd9c8ff;
        break;
      default:
        style.fill = 0xf4f4f4;
        break;
    }
    return style;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private markDirty(): void {
    this.dirty = true;
  }
}

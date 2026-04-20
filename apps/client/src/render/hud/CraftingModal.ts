import * as PIXI from "pixi.js";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { Rect } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const CRAFT_MODAL_TILE_GAP = 12;
const CRAFT_MODAL_TILE_MIN_WIDTH = 92;
const CRAFT_MODAL_PREVIEW_ICON_SIZE = 132;
const CRAFT_BUTTON_WIDTH = 176;
const CRAFT_BUTTON_HEIGHT = 48;
const CRAFT_MODAL_MAX_TILES = 64;

export type CraftingModalEntry = {
  typeId: ResourceId;
  label: string;
  description: string;
  costsLabel: string;
  outputAmount: number;
  available: boolean;
};

type CraftingModalStyles = {
  titleStyle: PIXI.TextStyle;
  detailTitleStyle: PIXI.TextStyle;
  detailBodyStyle: PIXI.TextStyle;
  tileLabelStyle: PIXI.TextStyle;
};

class CraftTileView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly icon: PIXI.Sprite;
  private readonly label: PIXI.Text;
  private rect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(labelStyle: PIXI.TextStyle) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.icon = new PIXI.Sprite();
    this.icon.anchor.set(0.5);
    this.label = new PIXI.Text("", labelStyle);
    this.label.anchor.set(0.5, 0);

    this.container.addChild(this.background);
    this.container.addChild(this.icon);
    this.container.addChild(this.label);
  }

  public setLayout(x: number, y: number, width: number, height: number): void {
    this.rect = { x, y, width, height };
    this.container.position.set(x, y);
    this.label.position.set(width / 2, height - 24);
  }

  public render(
    entry: CraftingModalEntry,
    texture: PIXI.Texture,
    selected: boolean,
    previewed: boolean,
  ): void {
    const { width, height } = this.rect;
    const isActive = selected || previewed;
    const fill = entry.available ? 0x1a261c : 0x151517;
    const border = selected ? 0xf3f6ee : previewed ? 0x8ed061 : 0x58645a;

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 12)
      .fill({ color: fill, alpha: entry.available ? 0.95 : 0.72 })
      .roundRect(0, 0, width, height, 12)
      .stroke({
        width: selected ? 3 : 2,
        color: border,
        alpha: isActive ? 1 : 0.75,
      })
      .roundRect(4, 4, width - 8, height - 8, 10)
      .stroke({
        width: 1,
        color: entry.available ? 0x2f5135 : 0x38363b,
        alpha: 0.75,
      });

    const iconSize = Math.max(24, Math.min(width - 24, height - 54));
    this.icon.texture = texture;
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(width / 2, 18 + iconSize / 2);
    this.icon.alpha = entry.available ? 1 : 0.45;

    this.label.text = entry.label;
    this.label.style.fill = entry.available ? 0xf1f6ef : 0x8b9188;
    this.label.style.wordWrap = true;
    this.label.style.wordWrapWidth = Math.max(0, width - 16);
  }

  public getRect(): Rect {
    return this.rect;
  }
}

export class CraftingModal {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly leftPane: PIXI.Graphics;
  private readonly rightPane: PIXI.Graphics;
  private readonly divider: PIXI.Graphics;
  private readonly leftTitle: PIXI.Text;
  private readonly rightTitle: PIXI.Text;
  private readonly previewFrame: PIXI.Graphics;
  private readonly previewSprite: PIXI.Sprite;
  private readonly previewLabel: PIXI.Text;
  private readonly previewStatus: PIXI.Text;
  private readonly previewDescription: PIXI.Text;
  private readonly previewOutput: PIXI.Text;
  private readonly previewCosts: PIXI.Text;
  private readonly craftButton: PIXI.Graphics;
  private readonly craftButtonLabel: PIXI.Text;
  private readonly tileViews: CraftTileView[] = [];
  private readonly tileRects = new Map<ResourceId, Rect>();
  private craftButtonRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private modalRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private previewRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(styles: CraftingModalStyles) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.leftPane = new PIXI.Graphics();
    this.rightPane = new PIXI.Graphics();
    this.divider = new PIXI.Graphics();
    this.leftTitle = new PIXI.Text("Craftables", styles.titleStyle);
    this.rightTitle = new PIXI.Text("Details", styles.titleStyle);
    this.previewFrame = new PIXI.Graphics();
    this.previewSprite = new PIXI.Sprite();
    this.previewSprite.anchor.set(0.5);
    this.previewLabel = new PIXI.Text("", styles.detailTitleStyle);
    this.previewStatus = new PIXI.Text("", styles.detailBodyStyle);
    this.previewDescription = new PIXI.Text("", styles.detailBodyStyle);
    this.previewOutput = new PIXI.Text("", styles.detailBodyStyle);
    this.previewCosts = new PIXI.Text("", styles.detailBodyStyle);
    this.craftButton = new PIXI.Graphics();
    this.craftButtonLabel = new PIXI.Text("", styles.detailBodyStyle);
    this.craftButtonLabel.anchor.set(0.5);

    this.container.addChild(
      this.background,
      this.leftPane,
      this.rightPane,
      this.divider,
      this.leftTitle,
      this.rightTitle,
      this.previewFrame,
      this.previewSprite,
      this.previewLabel,
      this.previewStatus,
      this.previewDescription,
      this.previewOutput,
      this.previewCosts,
      this.craftButton,
      this.craftButtonLabel,
    );

    this.previewDescription.style.wordWrap = true;
    this.previewOutput.style.wordWrap = true;
    this.previewCosts.style.wordWrap = true;

    for (let index = 0; index < CRAFT_MODAL_MAX_TILES; index += 1) {
      const tileView = new CraftTileView(styles.tileLabelStyle);
      this.tileViews.push(tileView);
      this.container.addChild(tileView.container);
    }
  }

  public sync(options: {
    screenWidth: number;
    screenHeight: number;
    entries: CraftingModalEntry[];
    selectedCraft: ResourceId;
    previewedCraft: ResourceId;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    craftButtonEnabled: boolean;
    previewStatusLabel: string;
    visible: boolean;
  }): void {
    const {
      screenWidth,
      screenHeight,
      entries,
      selectedCraft,
      previewedCraft,
      iconProvider,
      craftButtonEnabled,
      previewStatusLabel,
      visible,
    } = options;

    this.container.visible = visible;
    this.tileRects.clear();
    if (!visible) {
      this.craftButtonRect = { x: 0, y: 0, width: 0, height: 0 };
      this.modalRect = { x: 0, y: 0, width: 0, height: 0 };
      this.previewRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    let modalWidth = Math.min(860, screenWidth - 32);
    if (modalWidth < 520) {
      modalWidth = Math.max(320, screenWidth - 16);
    }

    let modalHeight = Math.min(560, screenHeight - 32);
    if (modalHeight < 360) {
      modalHeight = Math.max(300, screenHeight - 16);
    }

    const modalX = Math.floor((screenWidth - modalWidth) / 2);
    const modalY = Math.floor((screenHeight - modalHeight) / 2);
    this.modalRect = {
      x: modalX,
      y: modalY,
      width: modalWidth,
      height: modalHeight,
    };
    this.container.position.set(modalX, modalY);

    const leftWidth = Math.floor(modalWidth * 0.6);
    const rightWidth = modalWidth - leftWidth;
    const paneHeight = modalHeight;

    drawRoundedRect(
      this.background,
      0,
      0,
      modalWidth,
      modalHeight,
      18,
      { color: 0x08100a, alpha: 0.9 },
      { width: 2, color: 0x90c87a, alpha: 0.25 },
    );
    drawRoundedRect(
      this.leftPane,
      10,
      10,
      leftWidth - 15,
      paneHeight - 20,
      14,
      { color: 0x101913, alpha: 0.84 },
    );
    drawRoundedRect(
      this.rightPane,
      leftWidth,
      10,
      rightWidth - 10,
      paneHeight - 20,
      14,
      { color: 0x0d1410, alpha: 0.9 },
    );

    this.divider.clear();
    this.divider
      .moveTo(leftWidth, 22)
      .lineTo(leftWidth, paneHeight - 22)
      .stroke({ width: 1, color: 0x26352a, alpha: 0.85 });

    this.leftTitle.position.set(26, 24);
    this.rightTitle.position.set(leftWidth + 22, 24);

    const leftInnerX = 26;
    const leftInnerY = 58;
    const leftInnerWidth = leftWidth - leftInnerX - 22;
    const leftInnerHeight = paneHeight - leftInnerY - 22;
    const columns = Math.max(
      2,
      Math.floor(
        (leftInnerWidth + CRAFT_MODAL_TILE_GAP) /
          (CRAFT_MODAL_TILE_MIN_WIDTH + CRAFT_MODAL_TILE_GAP),
      ),
    );
    const tileWidth = Math.floor(
      (leftInnerWidth - (columns - 1) * CRAFT_MODAL_TILE_GAP) / columns,
    );
    const tileHeight = Math.max(110, tileWidth + 22);

    for (let index = 0; index < this.tileViews.length; index += 1) {
      const tileView = this.tileViews[index];
      const entry = entries[index];
      if (!tileView) {
        continue;
      }
      if (!entry) {
        tileView.container.visible = false;
        continue;
      }

      tileView.container.visible = true;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const tileX = leftInnerX + column * (tileWidth + CRAFT_MODAL_TILE_GAP);
      const tileY = leftInnerY + row * (tileHeight + CRAFT_MODAL_TILE_GAP);
      if (tileY + tileHeight > leftInnerY + leftInnerHeight) {
        tileView.container.visible = false;
        continue;
      }

      tileView.setLayout(tileX, tileY, tileWidth, tileHeight);
      tileView.render(
        entry,
        iconProvider(entry.typeId),
        entry.typeId === selectedCraft,
        entry.typeId === previewedCraft,
      );

      const rect = tileView.getRect();
      this.tileRects.set(entry.typeId, {
        x: modalX + rect.x,
        y: modalY + rect.y,
        width: rect.width,
        height: rect.height,
      });
    }

    const previewEntry =
      entries.find((entry) => entry.typeId === previewedCraft) ?? entries[0];
    if (!previewEntry) {
      return;
    }

    const previewLeft = leftWidth + 26;
    const previewTop = 60;
    const detailWidth = modalWidth - previewLeft - 26;
    this.previewRect = {
      x: modalX + previewLeft,
      y: modalY + previewTop,
      width: detailWidth,
      height: CRAFT_MODAL_PREVIEW_ICON_SIZE + 26,
    };

    drawRoundedRect(
      this.previewFrame,
      previewLeft,
      previewTop,
      detailWidth,
      CRAFT_MODAL_PREVIEW_ICON_SIZE + 26,
      14,
      { color: 0x152018, alpha: 0.92 },
      { width: 2, color: 0x8ed061, alpha: 0.65 },
    );

    this.previewSprite.texture = iconProvider(previewEntry.typeId);
    this.previewSprite.width = CRAFT_MODAL_PREVIEW_ICON_SIZE;
    this.previewSprite.height = CRAFT_MODAL_PREVIEW_ICON_SIZE;
    this.previewSprite.position.set(
      previewLeft + detailWidth / 2,
      previewTop + (CRAFT_MODAL_PREVIEW_ICON_SIZE + 26) / 2,
    );

    this.previewLabel.text = previewEntry.label;
    this.previewLabel.position.set(previewLeft, previewTop + 182);

    this.previewStatus.text = previewStatusLabel;
    this.previewStatus.style.fill = craftButtonEnabled
      ? 0x8ed061
      : previewEntry.available
        ? 0xc7b27c
        : 0xd78a76;
    this.previewStatus.position.set(previewLeft, previewTop + 216);

    this.previewDescription.text = previewEntry.description;
    this.previewDescription.style.wordWrapWidth = detailWidth;
    this.previewDescription.position.set(previewLeft, previewTop + 250);

    const buttonY =
      this.previewDescription.y + this.previewDescription.height + 18;
    const buttonWidth = Math.min(detailWidth, CRAFT_BUTTON_WIDTH);
    this.craftButtonRect = {
      x: modalX + previewLeft,
      y: modalY + buttonY,
      width: buttonWidth,
      height: CRAFT_BUTTON_HEIGHT,
    };

    drawRoundedRect(
      this.craftButton,
      previewLeft,
      buttonY,
      buttonWidth,
      CRAFT_BUTTON_HEIGHT,
      12,
      {
        color: craftButtonEnabled ? 0x234028 : 0x1a201b,
        alpha: craftButtonEnabled ? 0.96 : 0.85,
      },
      {
        width: 2,
        color: craftButtonEnabled ? 0x8ed061 : 0x5b625a,
        alpha: 0.95,
      },
    );

    this.craftButtonLabel.text = craftButtonEnabled ? "Craft" : "Unavailable";
    this.craftButtonLabel.style.fill = craftButtonEnabled ? 0xf1f6ef : 0x8e958c;
    this.craftButtonLabel.position.set(
      previewLeft + buttonWidth / 2,
      buttonY + CRAFT_BUTTON_HEIGHT / 2,
    );

    this.previewOutput.text = `Output: ${previewEntry.outputAmount}`;
    this.previewOutput.style.wordWrapWidth = detailWidth;
    this.previewOutput.position.set(
      previewLeft,
      buttonY + CRAFT_BUTTON_HEIGHT + 18,
    );

    this.previewCosts.text = `Costs: ${previewEntry.costsLabel}`;
    this.previewCosts.style.wordWrapWidth = detailWidth;
    this.previewCosts.position.set(
      previewLeft,
      this.previewOutput.y + this.previewOutput.height + 12,
    );
  }

  public containsPoint(screenX: number, screenY: number): boolean {
    return isPointInRect(screenX, screenY, this.modalRect);
  }

  public getCraftAtPoint(screenX: number, screenY: number): ResourceId | null {
    for (const [typeId, rect] of this.tileRects.entries()) {
      if (isPointInRect(screenX, screenY, rect)) {
        return typeId;
      }
    }
    return null;
  }

  public isCraftButtonAtPoint(screenX: number, screenY: number): boolean {
    return isPointInRect(screenX, screenY, this.craftButtonRect);
  }

  public getPreviewedCraftAtPoint(
    screenX: number,
    screenY: number,
    previewedCraft: ResourceId,
  ): ResourceId | null {
    return isPointInRect(screenX, screenY, this.previewRect)
      ? previewedCraft
      : null;
  }

  public getCraftRect(typeId: ResourceId): Rect | null {
    return this.tileRects.get(typeId) ?? null;
  }

  public getPreviewRect(): Rect | null {
    return this.previewRect.width > 0 && this.previewRect.height > 0
      ? this.previewRect
      : null;
  }
}

function isPointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

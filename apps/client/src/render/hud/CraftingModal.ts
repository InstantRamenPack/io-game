import * as PIXI from "pixi.js";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { Rect } from "@client/render/renderTypes.ts";
import type { CraftingTabId } from "@client/render/hud/HudInteractionState.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const CRAFT_MODAL_TILE_GAP = 12;
const CRAFT_MODAL_TILE_MIN_WIDTH = 92;
const CRAFT_MODAL_MAX_TILES = 64;
const CRAFT_MODAL_SCROLLBAR_WIDTH = 6;
const CRAFT_TAB_HEIGHT = 30;
const CRAFT_TAB_GAP = 8;
const HUB_COLUMN_GAP = 14;
const CRAFT_OUTPUT_SLOT_SIZE = 72;
const CRAFT_OUTPUT_COLUMN_WIDTH = 90;

export type CraftingModalTab = {
  id: CraftingTabId;
  label: string;
  count: number;
};

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
    const fill = entry.available ? 0x182234 : 0x151517;
    const border = selected ? 0xf3f6ee : previewed ? 0x6ea8ff : 0x59667a;

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
        color: entry.available ? 0x355a96 : 0x38363b,
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
  private readonly leftTitle: PIXI.Text;
  private readonly outputTitle: PIXI.Text;
  private readonly craftOutputFrame: PIXI.Graphics;
  private readonly craftOutputIcon: PIXI.Sprite;
  private readonly craftOutputHint: PIXI.Text;
  private readonly craftOutputCosts: PIXI.Text;
  private readonly tabBar: PIXI.Container;
  private readonly tabBackgrounds = new Map<CraftingTabId, PIXI.Graphics>();
  private readonly tabLabels = new Map<CraftingTabId, PIXI.Text>();
  private readonly tileViewportMask: PIXI.Graphics;
  private readonly tileViews: CraftTileView[] = [];
  private readonly tileRects = new Map<ResourceId, Rect>();
  private readonly tabRects = new Map<CraftingTabId, Rect>();
  private craftOutputRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private modalRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private scrollRowOffset = 0;

  constructor(styles: CraftingModalStyles) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.leftPane = new PIXI.Graphics();
    this.leftTitle = new PIXI.Text("Craftables", styles.titleStyle);
    this.outputTitle = new PIXI.Text("Output", styles.titleStyle);
    this.tabBar = new PIXI.Container();
    this.craftOutputFrame = new PIXI.Graphics();
    this.craftOutputIcon = new PIXI.Sprite();
    this.craftOutputIcon.anchor.set(0.5);
    this.craftOutputHint = new PIXI.Text(
      "Drag to hotbar",
      styles.detailBodyStyle,
    );
    this.craftOutputCosts = new PIXI.Text("", styles.detailBodyStyle);
    this.tileViewportMask = new PIXI.Graphics();

    this.container.addChild(
      this.background,
      this.leftPane,
      this.leftTitle,
      this.outputTitle,
      this.tabBar,
      this.craftOutputFrame,
      this.craftOutputIcon,
      this.craftOutputHint,
      this.craftOutputCosts,
      this.tileViewportMask,
    );

    this.craftOutputCosts.style.wordWrap = true;
    this.craftOutputCosts.style.wordWrapWidth = CRAFT_OUTPUT_COLUMN_WIDTH - 8;
    this.craftOutputHint.style.align = "center";

    for (let index = 0; index < CRAFT_MODAL_MAX_TILES; index += 1) {
      const tileView = new CraftTileView(styles.tileLabelStyle);
      tileView.container.mask = this.tileViewportMask;
      this.tileViews.push(tileView);
      this.container.addChild(tileView.container);
    }
  }

  public sync(options: {
    screenWidth: number;
    screenHeight: number;
    entries: CraftingModalEntry[];
    tabs: readonly CraftingModalTab[];
    activeTab: CraftingTabId;
    selectedCraft: ResourceId;
    previewedCraft: ResourceId;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    craftButtonEnabled: boolean;
    previewStatusLabel: string;
    companionColumnWidth?: number | null;
    visible: boolean;
  }): void {
    const {
      screenWidth,
      screenHeight,
      entries,
      tabs,
      activeTab,
      selectedCraft,
      previewedCraft,
      iconProvider,
      craftButtonEnabled,
      previewStatusLabel,
      companionColumnWidth,
      visible,
    } = options;

    this.container.visible = visible;
    this.tileRects.clear();
    this.tabRects.clear();
    if (!visible) {
      this.craftOutputRect = { x: 0, y: 0, width: 0, height: 0 };
      this.modalRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    const dockedColumnWidth = companionColumnWidth ?? 0;
    const dockedColumnGap = dockedColumnWidth > 0 ? HUB_COLUMN_GAP : 0;
    const availableLeftWidth =
      screenWidth - 32 - dockedColumnWidth - dockedColumnGap;

    let modalWidth =
      dockedColumnWidth > 0
        ? Math.min(620, availableLeftWidth)
        : Math.min(780, screenWidth - 32);
    if (modalWidth < 520) {
      modalWidth = Math.max(320, screenWidth - 16);
    }

    let modalHeight = Math.min(560, screenHeight - 32);
    if (modalHeight < 360) {
      modalHeight = Math.max(300, screenHeight - 16);
    }

    const totalModalWidth = modalWidth + dockedColumnGap + dockedColumnWidth;
    const modalX = Math.floor((screenWidth - totalModalWidth) / 2);
    const modalY = Math.floor((screenHeight - modalHeight) / 2);
    this.modalRect = {
      x: modalX,
      y: modalY,
      width: modalWidth,
      height: modalHeight,
    };
    this.container.position.set(modalX, modalY);

    const outputColumnX = modalWidth - CRAFT_OUTPUT_COLUMN_WIDTH - 22;
    const paneHeight = modalHeight;
    const mainPaneHeight = paneHeight - 20;

    drawRoundedRect(
      this.background,
      0,
      0,
      modalWidth,
      modalHeight,
      18,
      { color: 0x08100a, alpha: 0.9 },
      { width: 2, color: 0x7aa9ff, alpha: 0.32 },
    );
    drawRoundedRect(
      this.leftPane,
      10,
      10,
      modalWidth - 20,
      mainPaneHeight,
      14,
      { color: 0x101913, alpha: 0.84 },
    );

    this.leftTitle.position.set(26, 24);
    this.outputTitle.position.set(outputColumnX + 8, 24);

    const leftInnerX = 26;
    const tabsY = 58;
    const gridInnerWidth = outputColumnX - leftInnerX - CRAFT_MODAL_TILE_GAP;
    this.syncTabs(
      tabs,
      activeTab,
      modalX,
      modalY,
      leftInnerX,
      tabsY,
      gridInnerWidth,
    );
    const leftInnerY = tabsY + CRAFT_TAB_HEIGHT + 14;
    const leftInnerHeight = mainPaneHeight - leftInnerY + 10;
    this.tileViewportMask.clear();
    this.tileViewportMask
      .rect(leftInnerX, leftInnerY, gridInnerWidth, leftInnerHeight)
      .fill({ color: 0xffffff, alpha: 1 });
    const columns = Math.max(
      2,
      Math.floor(
        (gridInnerWidth + CRAFT_MODAL_TILE_GAP) /
          (CRAFT_MODAL_TILE_MIN_WIDTH + CRAFT_MODAL_TILE_GAP),
      ),
    );
    const tileWidth = Math.floor(
      (gridInnerWidth - (columns - 1) * CRAFT_MODAL_TILE_GAP) / columns,
    );
    const tileHeight = Math.max(110, tileWidth + 22);
    const rowCount = Math.ceil(entries.length / columns);
    const rowStride = tileHeight + CRAFT_MODAL_TILE_GAP;
    const visibleRows = Math.max(1, leftInnerHeight / rowStride);
    const maxScrollRowOffset = Math.max(0, rowCount - visibleRows);
    this.scrollRowOffset = clamp(this.scrollRowOffset, 0, maxScrollRowOffset);

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
      const tileY = leftInnerY + (row - this.scrollRowOffset) * rowStride;
      if (
        tileY + tileHeight < leftInnerY ||
        tileY > leftInnerY + leftInnerHeight
      ) {
        tileView.container.visible = false;
        continue;
      }
      const tileX = leftInnerX + column * (tileWidth + CRAFT_MODAL_TILE_GAP);

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

    if (maxScrollRowOffset > 0) {
      const scrollbarX =
        leftInnerX + gridInnerWidth - CRAFT_MODAL_SCROLLBAR_WIDTH;
      const scrollbarHeight = leftInnerHeight;
      const thumbHeight = Math.max(
        28,
        Math.floor((visibleRows / rowCount) * scrollbarHeight),
      );
      const thumbY =
        leftInnerY +
        Math.floor(
          (this.scrollRowOffset / maxScrollRowOffset) *
            (scrollbarHeight - thumbHeight),
        );
      this.leftPane
        .roundRect(
          scrollbarX,
          leftInnerY,
          CRAFT_MODAL_SCROLLBAR_WIDTH,
          scrollbarHeight,
          3,
        )
        .fill({ color: 0x1b2740, alpha: 0.9 })
        .roundRect(
          scrollbarX,
          thumbY,
          CRAFT_MODAL_SCROLLBAR_WIDTH,
          thumbHeight,
          3,
        )
        .fill({ color: 0x6ea8ff, alpha: 0.95 });
    }

    const previewEntry =
      entries.find((entry) => entry.typeId === previewedCraft) ?? entries[0];

    const outputSlotX = outputColumnX + 6;
    const outputSlotY =
      leftInnerY +
      Math.max(0, Math.floor((leftInnerHeight - CRAFT_OUTPUT_SLOT_SIZE) / 2));
    this.craftOutputRect = {
      x: modalX + outputSlotX,
      y: modalY + outputSlotY,
      width: CRAFT_OUTPUT_SLOT_SIZE,
      height: CRAFT_OUTPUT_SLOT_SIZE,
    };

    if (previewEntry) {
      const outputReady = craftButtonEnabled && previewEntry.available;
      drawRoundedRect(
        this.craftOutputFrame,
        outputSlotX,
        outputSlotY,
        CRAFT_OUTPUT_SLOT_SIZE,
        CRAFT_OUTPUT_SLOT_SIZE,
        12,
        { color: outputReady ? 0x1f3f66 : 0x151517, alpha: 0.96 },
        {
          width: 3,
          color: outputReady ? 0x6ea8ff : 0x4a5a72,
          alpha: 0.95,
        },
      );
      const iconSize = CRAFT_OUTPUT_SLOT_SIZE - 28;
      this.craftOutputIcon.texture = iconProvider(previewEntry.typeId);
      this.craftOutputIcon.width = iconSize;
      this.craftOutputIcon.height = iconSize;
      this.craftOutputIcon.position.set(
        outputSlotX + CRAFT_OUTPUT_SLOT_SIZE / 2,
        outputSlotY + CRAFT_OUTPUT_SLOT_SIZE / 2 - 4,
      );
      this.craftOutputIcon.visible = true;
      this.craftOutputHint.text = outputReady
        ? "Drag to hotbar"
        : previewStatusLabel;
      this.craftOutputHint.style.fill = outputReady ? 0xa8c4ef : 0xd78a76;
      this.craftOutputHint.position.set(
        outputSlotX + CRAFT_OUTPUT_SLOT_SIZE / 2,
        outputSlotY + CRAFT_OUTPUT_SLOT_SIZE + 6,
      );
      this.craftOutputHint.anchor.set(0.5, 0);
      this.craftOutputCosts.text = `Costs: ${previewEntry.costsLabel}`;
      this.craftOutputCosts.position.set(
        outputColumnX,
        outputSlotY + CRAFT_OUTPUT_SLOT_SIZE + 46,
      );
    } else {
      this.craftOutputFrame.clear();
      this.craftOutputIcon.visible = false;
      this.craftOutputHint.text = "Select a recipe";
      this.craftOutputCosts.text = "";
    }
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

  public getTabAtPoint(screenX: number, screenY: number): CraftingTabId | null {
    for (const [tabId, rect] of this.tabRects.entries()) {
      if (isPointInRect(screenX, screenY, rect)) {
        return tabId;
      }
    }
    return null;
  }

  public isCraftOutputAtPoint(screenX: number, screenY: number): boolean {
    return isPointInRect(screenX, screenY, this.craftOutputRect);
  }

  public isCraftButtonAtPoint(_screenX: number, _screenY: number): boolean {
    return false;
  }

  public getPreviewedCraftAtPoint(
    screenX: number,
    screenY: number,
    previewedCraft: ResourceId,
  ): ResourceId | null {
    return this.isCraftOutputAtPoint(screenX, screenY) ? previewedCraft : null;
  }

  public getModalRect(): Rect {
    return this.modalRect;
  }

  public getCraftRect(typeId: ResourceId): Rect | null {
    return this.tileRects.get(typeId) ?? null;
  }

  public scrollBy(deltaRows: number): boolean {
    if (!Number.isFinite(deltaRows) || deltaRows === 0) {
      return false;
    }
    this.scrollRowOffset = Math.max(0, this.scrollRowOffset + deltaRows);
    return true;
  }

  public getCraftOutputRect(): Rect | null {
    return this.craftOutputRect.width > 0 && this.craftOutputRect.height > 0
      ? this.craftOutputRect
      : null;
  }

  public getPreviewRect(): Rect | null {
    return this.getCraftOutputRect();
  }

  private syncTabs(
    tabs: readonly CraftingModalTab[],
    activeTab: CraftingTabId,
    modalX: number,
    modalY: number,
    x: number,
    y: number,
    width: number,
  ): void {
    this.tabBar.position.set(0, 0);
    let tabX = x;
    const tabWidth = Math.max(
      74,
      Math.floor((width - (tabs.length - 1) * CRAFT_TAB_GAP) / tabs.length),
    );

    for (const tab of tabs) {
      let background = this.tabBackgrounds.get(tab.id);
      let label = this.tabLabels.get(tab.id);
      if (!background || !label) {
        background = new PIXI.Graphics();
        label = new PIXI.Text("", {
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 13,
          fill: 0xf1f6ef,
        });
        label.anchor.set(0.5);
        this.tabBackgrounds.set(tab.id, background);
        this.tabLabels.set(tab.id, label);
        this.tabBar.addChild(background, label);
      }

      const active = tab.id === activeTab;
      drawRoundedRect(
        background,
        tabX,
        y,
        tabWidth,
        CRAFT_TAB_HEIGHT,
        8,
        { color: active ? 0x1f3f66 : 0x141c27, alpha: active ? 0.96 : 0.82 },
        {
          width: 1,
          color: active ? 0x6ea8ff : 0x3d4a5f,
          alpha: active ? 0.95 : 0.7,
        },
      );
      label.text = `${tab.label} ${tab.count}`;
      label.style.fill = active ? 0xf1f6ef : 0xb7c0b5;
      label.position.set(tabX + tabWidth / 2, y + CRAFT_TAB_HEIGHT / 2);
      this.tabRects.set(tab.id, {
        x: modalX + tabX,
        y: modalY + y,
        width: tabWidth,
        height: CRAFT_TAB_HEIGHT,
      });
      tabX += tabWidth + CRAFT_TAB_GAP;
    }
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

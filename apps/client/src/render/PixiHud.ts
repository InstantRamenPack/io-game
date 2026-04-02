import * as PIXI from "pixijs";
import {
  BUILDABLE_ITEM_TYPE_IDS,
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";

const RESOURCE_TYPE_IDS = [
  "item:wood",
  "item:stone",
  "item:food",
  "item:gun_mag",
  "item:crossbow_mag",
] as const;
const HOTBAR_SLOT_COUNT = 9;

export type HudState = {
  buildMenuOpen: boolean;
  craftingMenuOpen: boolean;
  selectedBuild: ResourceId;
  selectedCraft: ResourceId;
};

type PixiHudOptions = {
  gameClient: GameClient;
  selectors: GameSelectors;
};

type PanelLayout = {
  minWidth?: number;
  maxWidth?: number;
};

type TextStyleOptions = Partial<PIXI.ITextStyle>;

class HudPanel {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly titleText: PIXI.Text;
  private readonly bodyText: PIXI.Text;
  private readonly padding = 12;
  private readonly gap = 6;
  private widthValue = 0;
  private heightValue = 0;

  constructor(titleStyle: TextStyleOptions, bodyStyle: TextStyleOptions) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.titleText = new PIXI.Text("", new PIXI.TextStyle(titleStyle));
    this.bodyText = new PIXI.Text("", new PIXI.TextStyle(bodyStyle));
    this.container.addChild(this.background);
    this.container.addChild(this.titleText);
    this.container.addChild(this.bodyText);
  }

  public setContent(
    title: string,
    body: string,
    { minWidth, maxWidth }: PanelLayout = {},
  ): void {
    this.titleText.text = title;
    this.bodyText.text = body;

    const wrapWidth =
      typeof maxWidth === "number"
        ? Math.max(0, maxWidth - this.padding * 2)
        : null;
    this.bodyText.style.wordWrap = wrapWidth !== null;
    this.bodyText.style.wordWrapWidth = wrapWidth ?? 0;

    const contentWidth = Math.max(
      this.titleText.width,
      this.bodyText.width,
      minWidth ?? 0,
    );

    this.widthValue = Math.ceil(contentWidth + this.padding * 2);
    this.heightValue = Math.ceil(
      this.padding * 2 +
        this.titleText.height +
        this.gap +
        this.bodyText.height,
    );

    this.background.clear();
    this.background.lineStyle(1, 0x90c87a, 0.2);
    this.background.beginFill(0x0a120b, 0.78);
    this.background.drawRoundedRect(
      0,
      0,
      this.widthValue,
      this.heightValue,
      12,
    );
    this.background.endFill();

    this.titleText.position.set(this.padding, this.padding);
    this.bodyText.position.set(
      this.padding,
      this.padding + this.titleText.height + this.gap,
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
}

type HotbarSlotItem = {
  typeId: ResourceId | null;
  count: number | null;
  showCountWhenOne?: boolean;
};

class HotbarSlotView {
  public readonly container: PIXI.Container;
  private readonly base: PIXI.Graphics;
  private readonly activeOutline: PIXI.Graphics;
  private readonly icon: PIXI.Sprite;
  private readonly countText: PIXI.Text;
  private readonly slotSize: number;
  private readonly iconPadding: number;
  private readonly iconProvider: (typeId: ResourceId) => PIXI.Texture;

  constructor(options: {
    slotSize: number;
    iconPadding: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
    countStyle: PIXI.TextStyle;
  }) {
    this.slotSize = options.slotSize;
    this.iconPadding = options.iconPadding;
    this.iconProvider = options.iconProvider;

    this.container = new PIXI.Container();
    this.base = new PIXI.Graphics();
    this.activeOutline = new PIXI.Graphics();
    this.icon = new PIXI.Sprite();
    this.icon.anchor.set(0.5);
    this.countText = new PIXI.Text("", options.countStyle);
    this.countText.anchor.set(1, 1);

    this.container.addChild(this.base);
    this.container.addChild(this.activeOutline);
    this.container.addChild(this.icon);
    this.container.addChild(this.countText);

    this.drawBase(false);
    this.setActive(false);
    this.clearItem();
  }

  public setActive(active: boolean): void {
    this.activeOutline.visible = active;
    if (active) {
      const inflate = 4;
      const size = this.slotSize + inflate * 2;
      this.activeOutline.clear();
      this.activeOutline.lineStyle(2.5, 0xf7f7f7, 0.95);
      this.activeOutline.beginFill(0x4a4a4a, 0.25);
      this.activeOutline.drawRoundedRect(
        -inflate,
        -inflate,
        size,
        size,
        5,
      );
      this.activeOutline.endFill();
    } else {
      this.activeOutline.clear();
    }

    this.drawBase(active);
  }

  public setItem(
    typeId: ResourceId,
    count: number | null,
    showCountWhenOne = false,
  ): void {
    this.icon.texture = this.iconProvider(typeId);
    const iconSize = this.slotSize - this.iconPadding * 2;
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(this.slotSize / 2, this.slotSize / 2);
    this.icon.visible = true;

    if (count !== null && (count > 1 || showCountWhenOne)) {
      this.countText.text = String(count);
      this.countText.position.set(
        this.slotSize - 4,
        this.slotSize - 2,
      );
      this.countText.visible = true;
    } else {
      this.countText.text = "";
      this.countText.visible = false;
    }
  }

  public clearItem(): void {
    this.icon.visible = false;
    this.countText.text = "";
    this.countText.visible = false;
  }

  private drawBase(active: boolean): void {
    this.base.clear();
    const fill = active ? 0x3a3a3a : 0x262626;
    const edge = active ? 0xf0f0f0 : 0x8e8e8e;
    const inner = active ? 0x5b5b5b : 0x3a3a3a;

    this.base.lineStyle(2, edge, 0.9);
    this.base.beginFill(fill, 0.92);
    this.base.drawRoundedRect(0, 0, this.slotSize, this.slotSize, 4);
    this.base.endFill();

    this.base.lineStyle(1, inner, 0.85);
    this.base.drawRoundedRect(2, 2, this.slotSize - 4, this.slotSize - 4, 3);
  }
}

class HotbarView {
  public readonly container: PIXI.Container;
  private readonly background: PIXI.Graphics;
  private readonly slots: HotbarSlotView[] = [];
  private readonly slotSize = 40;
  private readonly slotGap = 6;
  private readonly padding = 8;
  private readonly iconPadding = 5;
  private widthValue = 0;
  private heightValue = 0;

  constructor(options: {
    slotCount: number;
    iconProvider: (typeId: ResourceId) => PIXI.Texture;
  }) {
    this.container = new PIXI.Container();
    this.background = new PIXI.Graphics();
    this.container.addChild(this.background);

    const countStyle = new PIXI.TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 13,
      fill: 0xf3f6ee,
      dropShadow: true,
      dropShadowColor: 0x0a0f09,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
      stroke: 0x0c120b,
      strokeThickness: 3,
    });

    for (let index = 0; index < options.slotCount; index += 1) {
      const slot = new HotbarSlotView({
        slotSize: this.slotSize,
        iconPadding: this.iconPadding,
        iconProvider: options.iconProvider,
        countStyle,
      });
      slot.container.position.set(
        this.padding + index * (this.slotSize + this.slotGap),
        this.padding,
      );
      this.slots.push(slot);
      this.container.addChild(slot.container);
    }

    this.layoutBackground(options.slotCount);
  }

  public setSlots(items: HotbarSlotItem[], activeIndex: number | null): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      const item = items[index];
      slot.setActive(activeIndex === index);
      if (item && item.typeId) {
        slot.setItem(item.typeId, item.count, item.showCountWhenOne ?? false);
      } else {
        slot.clearItem();
      }
    }
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

  private layoutBackground(slotCount: number): void {
    const width =
      this.padding * 2 +
      slotCount * this.slotSize +
      (slotCount - 1) * this.slotGap;
    const height = this.padding * 2 + this.slotSize;
    this.widthValue = Math.ceil(width);
    this.heightValue = Math.ceil(height);

    this.background.clear();
    this.background.lineStyle(2, 0x4b4b4b, 0.7);
    this.background.beginFill(0x151515, 0.78);
    this.background.drawRoundedRect(0, 0, width, height, 6);
    this.background.endFill();

    this.background.lineStyle(1, 0x2a2a2a, 0.85);
    this.background.drawRoundedRect(2, 2, width - 4, height - 4, 5);
  }
}

export class PixiHud {
  private readonly gameClient: GameClient;
  private readonly selectors: GameSelectors;
  private readonly state: HudState;
  private root: PIXI.Container | null = null;
  private statusPanel?: HudPanel;
  private resourcePanel?: HudPanel;
  private effectPanel?: HudPanel;
  private hotbarView?: HotbarView;
  private buildPanel?: HudPanel;
  private craftingPanel?: HudPanel;
  private dayNightContainer?: PIXI.Container;
  private dayNightGraphic?: PIXI.Graphics;
  private dayNightLabel?: PIXI.Text;
  private visible = false;
  private dirty = true;
  private lastLayoutWidth = 0;
  private lastLayoutHeight = 0;
  private lastHotbarActiveIndex: number | null = null;
  private readonly titleStyle: TextStyleOptions = {
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    fontSize: 11,
    fill: 0x9fb39c,
    letterSpacing: 1.2,
  };
  private readonly bodyStyle: TextStyleOptions = {
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    fontSize: 13,
    fill: 0xe8f5e7,
    lineHeight: 18,
  };
  private readonly bodyStrongStyle: TextStyleOptions = {
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    fontSize: 18,
    fill: 0xe8f5e7,
    lineHeight: 22,
  };
  private readonly dayNightLabelStyle: TextStyleOptions = {
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
    fontSize: 12,
    fill: 0xdbe6d7,
    letterSpacing: 0.6,
  };
  private readonly dayNightBarWidth = 220;
  private readonly dayNightBarHeight = 14;
  private readonly dayNightBarGap = 6;
  private readonly dayNightTextDayColor = 0x2d4f37;
  private readonly dayNightTextNightColor = 0xcfe7d1;
  private readonly dayNightContrastLag = 0.12;

  constructor({ gameClient, selectors }: PixiHudOptions) {
    this.gameClient = gameClient;
    this.selectors = selectors;
    const defaultBuildItemTypeId = BUILDABLE_ITEM_TYPE_IDS[0];
    const defaultCraftItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[0];
    if (!defaultBuildItemTypeId) {
      throw new Error(
        "Expected at least one buildable item in shared content.",
      );
    }
    if (!defaultCraftItemTypeId) {
      throw new Error(
        "Expected at least one craftable item in shared content.",
      );
    }

    this.state = {
      buildMenuOpen: false,
      craftingMenuOpen: false,
      selectedBuild: defaultBuildItemTypeId,
      selectedCraft: defaultCraftItemTypeId,
    };
  }

  public attach(app: PIXI.Application<HTMLCanvasElement>): void {
    if (!this.root) {
      this.root = new PIXI.Container();
      this.statusPanel = new HudPanel(this.titleStyle, this.bodyStrongStyle);
      this.resourcePanel = new HudPanel(this.titleStyle, this.bodyStyle);
      this.effectPanel = new HudPanel(this.titleStyle, this.bodyStyle);
      this.hotbarView = new HotbarView({
        slotCount: HOTBAR_SLOT_COUNT,
        iconProvider: (typeId) => this.gameClient.renderer.getItemTexture(typeId),
      });
      this.buildPanel = new HudPanel(this.titleStyle, this.bodyStyle);
      this.craftingPanel = new HudPanel(this.titleStyle, this.bodyStyle);
      this.dayNightContainer = new PIXI.Container();
      this.dayNightGraphic = new PIXI.Graphics();
      this.dayNightLabel = new PIXI.Text(
        "",
        new PIXI.TextStyle(this.dayNightLabelStyle),
      );
      this.dayNightContainer.addChild(this.dayNightGraphic);
      this.dayNightContainer.addChild(this.dayNightLabel);

      this.root.addChild(
        this.statusPanel.container,
        this.resourcePanel.container,
        this.effectPanel.container,
        this.hotbarView.container,
        this.buildPanel.container,
        this.craftingPanel.container,
        this.dayNightContainer,
      );
    }

    if (this.root.parent !== app.stage) {
      app.stage.addChild(this.root);
    }

    this.root.visible = this.visible;
    this.markDirty();
  }

  public getState(): Readonly<HudState> {
    return this.state;
  }

  public refreshUi(): void {
    this.markDirty();
  }

  public toggleBuildMenu(): void {
    const nextOpen = !this.state.buildMenuOpen;
    this.state.buildMenuOpen = nextOpen;
    if (nextOpen) {
      this.state.craftingMenuOpen = false;
    }
    this.markDirty();
  }

  public toggleCraftingMenu(): void {
    const nextOpen = !this.state.craftingMenuOpen;
    this.state.craftingMenuOpen = nextOpen;
    if (nextOpen) {
      this.state.buildMenuOpen = false;
    }
    this.markDirty();
  }

  public selectMenuItemByOrdinal(ordinal: number): boolean {
    if (this.state.buildMenuOpen) {
      const nextBuildItemTypeId = BUILDABLE_ITEM_TYPE_IDS[ordinal - 1];
      if (!nextBuildItemTypeId) {
        return false;
      }

      this.state.selectedBuild = nextBuildItemTypeId;
      this.markDirty();
      return true;
    }

    if (!this.state.craftingMenuOpen) {
      return false;
    }

    const nextCraftItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[ordinal - 1];
    if (!nextCraftItemTypeId) {
      return false;
    }

    this.state.selectedCraft = nextCraftItemTypeId;
    this.markDirty();
    return true;
  }

  public queueSelectedCraft(): void {
    this.gameClient.queueCraftItem(this.state.selectedCraft);
    this.markDirty();
  }

  public handlePrimaryWorldAction(worldPoint: { x: number; y: number }): void {
    if (this.state.buildMenuOpen) {
      this.gameClient.queueBuildPlacement(
        this.state.selectedBuild,
        worldPoint.x,
        worldPoint.y,
      );
      return;
    }

    this.gameClient.startHoldFire(worldPoint.x, worldPoint.y);
  }

  public reset(): void {
    this.state.buildMenuOpen = false;
    this.state.craftingMenuOpen = false;
    this.markDirty();
  }

  public isBuildMenuOpen(): boolean {
    return this.state.buildMenuOpen;
  }

  public isCraftingMenuOpen(): boolean {
    return this.state.craftingMenuOpen;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.root) {
      this.root.visible = visible;
    }
    this.markDirty();
  }

  public render(app: PIXI.Application<HTMLCanvasElement>, force = false): void {
    if (!this.root) {
      return;
    }

    if (!this.visible) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    const sizeChanged =
      app.screen.width !== this.lastLayoutWidth ||
      app.screen.height !== this.lastLayoutHeight;
    const hotbarActiveIndex = this.computeHotbarActiveIndex();
    if (hotbarActiveIndex !== this.lastHotbarActiveIndex) {
      this.dirty = true;
    }

    if (!this.dirty && !force && !sizeChanged) {
      return;
    }

    this.lastLayoutWidth = app.screen.width;
    this.lastLayoutHeight = app.screen.height;
    this.dirty = false;

    this.syncPanels();
    this.syncDayNight();
    this.layoutPanels(app.screen.width, app.screen.height);
  }

  public markDirty(): void {
    this.dirty = true;
  }

  private layoutPanels(screenWidth: number, screenHeight: number): void {
    if (
      !this.statusPanel ||
      !this.resourcePanel ||
      !this.effectPanel ||
      !this.hotbarView ||
      !this.buildPanel ||
      !this.craftingPanel ||
      !this.dayNightContainer ||
      !this.dayNightLabel
    ) {
      return;
    }

    const padding = 16;
    const gap = 12;

    this.statusPanel.setPosition(padding, padding);
    this.resourcePanel.setPosition(
      screenWidth - padding - this.resourcePanel.width,
      padding,
    );
    this.effectPanel.setPosition(
      screenWidth - padding - this.effectPanel.width,
      padding + this.resourcePanel.height + gap,
    );

    this.hotbarView.setPosition(
      Math.floor((screenWidth - this.hotbarView.width) / 2),
      screenHeight - padding - this.hotbarView.height,
    );
    this.buildPanel.setPosition(
      Math.max(padding, Math.floor((screenWidth - this.buildPanel.width) / 2)),
      screenHeight - padding - this.buildPanel.height,
    );
    this.craftingPanel.setPosition(
      padding,
      screenHeight - padding - this.craftingPanel.height,
    );

    const dayNightWidth = Math.max(
      this.dayNightBarWidth,
      this.dayNightLabel.width,
    );
    this.dayNightContainer.position.set(
      Math.floor((screenWidth - dayNightWidth) / 2),
      padding,
    );
  }

  private syncPanels(): void {
    if (
      !this.statusPanel ||
      !this.resourcePanel ||
      !this.effectPanel ||
      !this.hotbarView ||
      !this.buildPanel ||
      !this.craftingPanel
    ) {
      return;
    }

    const playerEntity = this.selectors.getPlayerEntity();
    const worldEntities = this.selectors.getWorldEntities();
    const buildings = this.selectors.getTrackedBuildings();
    const activeEffectLabels = this.selectors.getActiveEffectLabels();
    const performanceRates = this.gameClient.getMeasuredRates();

    const tickRateLabel =
      performanceRates.tickRate === null
        ? "TPS --"
        : `TPS ${performanceRates.tickRate.toFixed(1)}`;
    const frameRateLabel =
      performanceRates.frameRate === null
        ? "FPS --"
        : `FPS ${performanceRates.frameRate.toFixed(1)}`;

    const worldStat = playerEntity
      ? `${playerEntity.name ?? "Survivor"}  HP ${playerEntity.hp ?? 0}/${playerEntity.maxHp ?? 0}`
      : "Awaiting welcome packet...";
    const worldDetail = [
      `Tick ${this.gameClient.worldState?.latestTick ?? 0}`,
      tickRateLabel,
      frameRateLabel,
      `${buildings.length} structures`,
      `${worldEntities.length} entities`,
    ].join(" // ");

    this.statusPanel.setContent("Sector Feed", `${worldStat}\n${worldDetail}`, {
      minWidth: 360,
      maxWidth: 520,
    });

    const resourceLines = RESOURCE_TYPE_IDS.map((typeId) => {
      return `${this.selectors.formatTypeLabel(typeId)}: ${this.selectors.countInventoryType(typeId)}`;
    }).join("\n");

    this.resourcePanel.setContent("Resources", resourceLines || "None", {
      minWidth: 200,
      maxWidth: 240,
    });

    const effectLines =
      activeEffectLabels.length > 0
        ? activeEffectLabels
        : ["No active effects"];
    this.effectPanel.setContent("Effects", effectLines.join("\n"), {
      minWidth: 200,
      maxWidth: 240,
    });

    const inventory = this.selectors.getInventory();
    const hotbarWeapons = this.selectors.getHotbarWeapons();
    const activeWeaponIndex = this.resolveHotbarActiveIndex(
      inventory?.activeWeaponIndex ?? null,
    );

    const hotbarItems = Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, slotIndex) => {
        const weapon = hotbarWeapons[slotIndex] ?? null;
        if (weapon) {
          const ammoCount =
            typeof weapon.ammoInMag === "number" ? weapon.ammoInMag : null;
          return {
            typeId: weapon.typeId,
            count: ammoCount,
            showCountWhenOne: ammoCount !== null,
          } satisfies HotbarSlotItem;
        }

        return {
          typeId: null,
          count: null,
          showCountWhenOne: false,
        } satisfies HotbarSlotItem;
      },
    );

    this.hotbarView.setSlots(hotbarItems, activeWeaponIndex);
    this.lastHotbarActiveIndex = activeWeaponIndex;

    const buildLines = BUILDABLE_ITEM_TYPE_IDS.map((itemTypeId, index) => {
      const recipe = this.getSelectedRecipeForItem(itemTypeId);
      const availableCount = this.selectors.countInventoryType(itemTypeId);
      const selectedMark =
        this.state.selectedBuild === itemTypeId ? "> " : "  ";
      const availability =
        availableCount > 0 ? `${availableCount} ready` : "Out of stock";
      return `${selectedMark}${index + 1}. ${this.selectors.formatTypeLabel(itemTypeId)}  (${availability})  ${this.selectors.formatCosts(recipe.costs)}`;
    }).join("\n");

    const selectedRecipe = this.getSelectedRecipeForItem(
      this.state.selectedBuild,
    );
    const availableCount = this.selectors.countInventoryType(
      this.state.selectedBuild,
    );
    const buildHint = `${selectedRecipe.hint ?? "Place the selected structure at your cursor."}  ${availableCount} in inventory. Press 1-4 while this panel is open to switch selection. Left click to place.`;

    this.buildPanel.setContent(
      "Build Placement",
      `${buildLines}\n\n${buildHint}`,
      { minWidth: 300, maxWidth: 360 },
    );
    this.buildPanel.container.visible = this.state.buildMenuOpen;

    const craftingLines = CRAFTABLE_ITEM_TYPE_IDS.map((itemTypeId, index) => {
      const recipe = this.getSelectedRecipeForItem(itemTypeId);
      const available = this.selectors.hasRecipeResources(recipe);
      const selectedMark =
        this.state.selectedCraft === itemTypeId ? "> " : "  ";
      const availability = available ? "Craftable" : "Missing materials";
      return `${selectedMark}${index + 1}. ${this.selectors.formatTypeLabel(itemTypeId)}  (${availability})  ${this.selectors.formatCosts(recipe.costs)}`;
    }).join("\n");

    const craftingHint =
      `Press 1-${CRAFTABLE_ITEM_TYPE_IDS.length} to switch selection. ` +
      `Press Enter to craft ${this.selectors.formatTypeLabel(this.state.selectedCraft)}.`;

    this.craftingPanel.setContent(
      "Crafting",
      `${craftingLines}\n\n${craftingHint}`,
      { minWidth: 300, maxWidth: 360 },
    );
    this.craftingPanel.container.visible = this.state.craftingMenuOpen;
  }

  private syncDayNight(): void {
    if (
      !this.dayNightContainer ||
      !this.dayNightGraphic ||
      !this.dayNightLabel
    ) {
      return;
    }
    const dayNightContainer = this.dayNightContainer;
    const dayNightGraphic = this.dayNightGraphic;
    const dayNightLabel = this.dayNightLabel;

    const dayNight = this.selectors.getDayNight();
    if (!dayNight) {
      dayNightContainer.visible = false;
      return;
    }

    dayNightContainer.visible = true;

    const totalDuration = dayNight.nightDurationMs + dayNight.dayDurationMs;
    const baseCycleElapsed =
      dayNight.phase === "night"
        ? dayNight.phaseElapsedMs
        : dayNight.nightDurationMs + dayNight.phaseElapsedMs;
    const receivedAt = this.gameClient.worldState?.latestSnapshotReceivedAt;
    const driftMs =
      receivedAt !== undefined
        ? Math.max(0, performance.now() - receivedAt)
        : 0;
    const nightBlend = this.computeNightBlend(dayNight, driftMs);
    const contrastBlend = this.applyContrastLag(nightBlend);
    const labelColor = this.lerpColor(
      this.dayNightTextDayColor,
      this.dayNightTextNightColor,
      contrastBlend,
    );
    const cycleElapsed =
      totalDuration > 0 ? (baseCycleElapsed + driftMs) % totalDuration : 0;
    const progress =
      totalDuration > 0
        ? Math.min(1, Math.max(0, cycleElapsed / totalDuration))
        : 0;

    const barWidth = this.dayNightBarWidth;
    const barHeight = this.dayNightBarHeight;
    const barY = dayNightLabel.height + this.dayNightBarGap;
    const nightWidth =
      totalDuration > 0
        ? Math.max(
            1,
            Math.round((dayNight.nightDurationMs / totalDuration) * barWidth),
          )
        : Math.floor(barWidth / 2);
    const dayWidth = barWidth - nightWidth;
    const centerX = Math.round(barWidth / 2);
    const markerX = centerX;

    dayNightLabel.text = `Day ${dayNight.dayCount + 1} · ${dayNight.phase}`;
    dayNightLabel.style.fill = labelColor;
    const contentWidth = Math.max(barWidth, dayNightLabel.width);
    const labelX = Math.max(
      0,
      Math.round((contentWidth - dayNightLabel.width) / 2),
    );
    const barX = Math.max(0, Math.round((contentWidth - barWidth) / 2));
    dayNightLabel.position.set(labelX, 0);

    dayNightGraphic.clear();
    dayNightGraphic.beginFill(0x0b140b, 0.85);
    dayNightGraphic.drawRoundedRect(barX, barY, barWidth, barHeight, 6);
    dayNightGraphic.endFill();

    const cycleOffset = progress * barWidth;
    const cycleStart = centerX - cycleOffset;

    const drawClipped = (x: number, width: number, color: number): void => {
      const start = Math.max(0, Math.round(x));
      const end = Math.min(barWidth, Math.round(x + width));
      if (end <= start) {
        return;
      }
      dayNightGraphic.beginFill(color, 0.95);
      dayNightGraphic.drawRect(barX + start, barY, end - start, barHeight);
      dayNightGraphic.endFill();
    };

    for (let index = -1; index <= 1; index += 1) {
      const segmentStart = cycleStart + index * barWidth;
      drawClipped(segmentStart, nightWidth, 0x6a5de3);
      drawClipped(segmentStart + nightWidth, dayWidth, 0xf2c84b);
    }

    dayNightGraphic.lineStyle(2, labelColor, 0.9);
    dayNightGraphic.moveTo(barX + markerX, barY - 2);
    dayNightGraphic.lineTo(barX + markerX, barY + barHeight + 2);
  }

  private computeHotbarActiveIndex(): number | null {
    const inventory = this.selectors.getInventory();
    return this.resolveHotbarActiveIndex(inventory?.activeWeaponIndex ?? null);
  }

  private resolveHotbarActiveIndex(
    inventoryActiveIndex: number | null,
  ): number | null {
    const pendingSelect = this.gameClient.inputManager.pendingSelectWeaponIndex;
    if (typeof pendingSelect === "number") {
      return pendingSelect;
    }
    return inventoryActiveIndex ?? null;
  }

  private computeNightBlend(
    dayNight: {
      phase: "day" | "night";
      phaseElapsedMs: number;
      dayDurationMs: number;
      nightDurationMs: number;
      dayCount: number;
    },
    driftMs: number,
  ): number {
    const phaseDuration =
      dayNight.phase === "night"
        ? dayNight.nightDurationMs
        : dayNight.dayDurationMs;
    if (phaseDuration <= 0) {
      return dayNight.phase === "night" ? 1 : 0;
    }

    const elapsed = Math.max(
      0,
      Math.min(dayNight.phaseElapsedMs + driftMs, phaseDuration),
    );
    const transitionMs = Math.max(
      1000,
      Math.min(15000, Math.floor(phaseDuration * 0.2)),
    );

    if (elapsed >= phaseDuration - transitionMs) {
      const t = (elapsed - (phaseDuration - transitionMs)) / transitionMs;
      return dayNight.phase === "night" ? 1 - t : t;
    }

    return dayNight.phase === "night" ? 1 : 0;
  }

  private applyContrastLag(blend: number): number {
    if (blend >= 0.5) {
      return Math.min(1, blend + this.dayNightContrastLag);
    }
    return Math.max(0, blend - this.dayNightContrastLag);
  }

  private lerpColor(start: number, end: number, t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    const startR = (start >> 16) & 0xff;
    const startG = (start >> 8) & 0xff;
    const startB = start & 0xff;
    const endR = (end >> 16) & 0xff;
    const endG = (end >> 8) & 0xff;
    const endB = end & 0xff;
    const r = Math.round(startR + (endR - startR) * clamped);
    const g = Math.round(startG + (endG - startG) * clamped);
    const b = Math.round(startB + (endB - startB) * clamped);
    return (r << 16) | (g << 8) | b;
  }

  private getSelectedRecipeForItem(itemTypeId: ResourceId): ItemRecipeContent {
    const recipe = getItemContent(itemTypeId)?.recipe;
    if (!recipe) {
      throw new Error(`Expected craft recipe for ${itemTypeId}.`);
    }
    return recipe;
  }
}

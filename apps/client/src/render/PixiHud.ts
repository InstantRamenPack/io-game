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

const RESOURCE_TYPE_IDS = ["item:wood", "item:stone", "item:food"] as const;
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

  public constructor(titleStyle: TextStyleOptions, bodyStyle: TextStyleOptions) {
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
      this.padding * 2 + this.titleText.height + this.gap + this.bodyText.height,
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

export class PixiHud {
  private readonly gameClient: GameClient;
  private readonly selectors: GameSelectors;
  private readonly state: HudState;
  private root: PIXI.Container | null = null;
  private statusPanel?: HudPanel;
  private resourcePanel?: HudPanel;
  private effectPanel?: HudPanel;
  private hotbarPanel?: HudPanel;
  private buildPanel?: HudPanel;
  private craftingPanel?: HudPanel;
  private dayNightContainer?: PIXI.Container;
  private dayNightGraphic?: PIXI.Graphics;
  private dayNightLabel?: PIXI.Text;
  private visible = false;
  private dirty = true;
  private lastLayoutWidth = 0;
  private lastLayoutHeight = 0;
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

  public constructor({ gameClient, selectors }: PixiHudOptions) {
    this.gameClient = gameClient;
    this.selectors = selectors;
    const defaultBuildItemTypeId = BUILDABLE_ITEM_TYPE_IDS[0];
    const defaultCraftItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[0];
    if (!defaultBuildItemTypeId) {
      throw new Error("Expected at least one buildable item in shared content.");
    }
    if (!defaultCraftItemTypeId) {
      throw new Error("Expected at least one craftable item in shared content.");
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
      this.hotbarPanel = new HudPanel(this.titleStyle, this.bodyStyle);
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
        this.hotbarPanel.container,
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
      !this.hotbarPanel ||
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

    this.hotbarPanel.setPosition(
      padding,
      screenHeight - padding - this.hotbarPanel.height,
    );
    this.buildPanel.setPosition(
      Math.max(
        padding,
        Math.floor((screenWidth - this.buildPanel.width) / 2),
      ),
      screenHeight - padding - this.buildPanel.height,
    );
    this.craftingPanel.setPosition(
      screenWidth - padding - this.craftingPanel.width,
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
      !this.hotbarPanel ||
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
      activeEffectLabels.length > 0 ? activeEffectLabels : ["No active effects"];
    this.effectPanel.setContent("Effects", effectLines.join("\n"), {
      minWidth: 200,
      maxWidth: 240,
    });

    const inventory = this.selectors.getInventory();
    const hotbarWeapons = this.selectors.getHotbarWeapons();
    const activeWeaponIndex = inventory?.activeWeaponIndex ?? null;
    const hotbarLines = Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, slotIndex) => {
        const weapon = hotbarWeapons[slotIndex] ?? null;
        if (!weapon) {
          return `${slotIndex + 1}. Empty`;
        }

        const isActive = activeWeaponIndex === slotIndex;
        const ammoLabel =
          typeof weapon.ammoInMag === "number" &&
          typeof weapon.magSize === "number"
            ? `${weapon.ammoInMag}/${weapon.magSize}`
            : "Ready";
        const prefix = isActive ? "> " : "  ";
        return `${prefix}${slotIndex + 1}. ${this.selectors.formatTypeLabel(weapon.typeId)}  ${ammoLabel}`;
      },
    ).join("\n");

    this.hotbarPanel.setContent("Loadout", hotbarLines, {
      minWidth: 320,
      maxWidth: 420,
    });

    const buildLines = BUILDABLE_ITEM_TYPE_IDS.map((itemTypeId, index) => {
      const recipe = this.getSelectedRecipeForItem(itemTypeId);
      const availableCount = this.selectors.countInventoryType(itemTypeId);
      const selectedMark = this.state.selectedBuild === itemTypeId ? "> " : "  ";
      const availability =
        availableCount > 0 ? `${availableCount} ready` : "Out of stock";
      return `${selectedMark}${index + 1}. ${this.selectors.formatTypeLabel(itemTypeId)}  (${availability})  ${this.selectors.formatCosts(recipe.costs)}`;
    }).join("\n");

    const selectedRecipe = this.getSelectedRecipeForItem(this.state.selectedBuild);
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
      const selectedMark = this.state.selectedCraft === itemTypeId ? "> " : "  ";
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
    if (!this.dayNightContainer || !this.dayNightGraphic || !this.dayNightLabel) {
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
      receivedAt !== undefined ? Math.max(0, performance.now() - receivedAt) : 0;
    const nightBlend = this.computeNightBlend(dayNight, driftMs);
    const contrastBlend = this.applyContrastLag(nightBlend);
    const labelColor = this.lerpColor(
      this.dayNightTextDayColor,
      this.dayNightTextNightColor,
      contrastBlend,
    );
    const cycleElapsed =
      totalDuration > 0
        ? (baseCycleElapsed + driftMs) % totalDuration
        : 0;
    const progress =
      totalDuration > 0 ? Math.min(1, Math.max(0, cycleElapsed / totalDuration)) : 0;

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
    const labelX = Math.max(0, Math.round((contentWidth - dayNightLabel.width) / 2));
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

  private computeNightBlend(
    dayNight: { phase: "day" | "night"; phaseElapsedMs: number; dayDurationMs: number; nightDurationMs: number; dayCount: number },
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

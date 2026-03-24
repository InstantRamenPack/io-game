import * as PIXI from "pixijs";
import {
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

  public constructor({ gameClient, selectors }: PixiHudOptions) {
    this.gameClient = gameClient;
    this.selectors = selectors;
    const defaultBuildItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[0];
    if (!defaultBuildItemTypeId) {
      throw new Error("Expected at least one craftable item in shared content.");
    }

    this.state = {
      buildMenuOpen: false,
      craftingMenuOpen: false,
      selectedBuild: defaultBuildItemTypeId,
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

      this.root.addChild(
        this.statusPanel.container,
        this.resourcePanel.container,
        this.effectPanel.container,
        this.hotbarPanel.container,
        this.buildPanel.container,
        this.craftingPanel.container,
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
    this.state.buildMenuOpen = !this.state.buildMenuOpen;
    this.markDirty();
  }

  public toggleCraftingMenu(): void {
    this.state.craftingMenuOpen = !this.state.craftingMenuOpen;
    this.markDirty();
  }

  public selectBuildByOrdinal(ordinal: number): boolean {
    const nextItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[ordinal - 1];
    if (!nextItemTypeId) {
      return false;
    }

    this.state.selectedBuild = nextItemTypeId;
    this.markDirty();
    return true;
  }

  public queueSelectedCraft(): void {
    this.gameClient.queueCraftItem(this.state.selectedBuild);
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

    this.gameClient.queueAttack(worldPoint.x, worldPoint.y);
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
      !this.craftingPanel
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
    const activeEffects = this.selectors.getActiveEffects();
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

    const effects =
      activeEffects.length > 0 ? activeEffects : ["No active buffs"];
    this.effectPanel.setContent("Effects", effects.join("\n"), {
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

    const buildLines = CRAFTABLE_ITEM_TYPE_IDS.map((itemTypeId, index) => {
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

    const craftingLines = CRAFTABLE_ITEM_TYPE_IDS.map((itemTypeId) => {
      const recipe = this.getSelectedRecipeForItem(itemTypeId);
      const available = this.selectors.hasRecipeResources(recipe);
      const selectedMark = this.state.selectedBuild === itemTypeId ? "> " : "  ";
      const availability = available ? "Craftable" : "Missing materials";
      return `${selectedMark}${this.selectors.formatTypeLabel(itemTypeId)}  (${availability})  ${this.selectors.formatCosts(recipe.costs)}`;
    }).join("\n");

    const nearbyLabels = buildings
      .map(
        (entity) =>
          entity.label ?? entity.name ?? this.selectors.formatTypeLabel(entity.typeId),
      )
      .slice(0, 3)
      .join(", ");

    const craftingHint =
      nearbyLabels.length > 0
        ? `Nearby structures: ${nearbyLabels}  Press Enter to craft ${this.selectors.formatTypeLabel(this.state.selectedBuild)}.`
        : `Press Enter to craft ${this.selectors.formatTypeLabel(this.state.selectedBuild)}.`;

    this.craftingPanel.setContent(
      "Crafting",
      `${craftingLines}\n\n${craftingHint}`,
      { minWidth: 300, maxWidth: 360 },
    );
    this.craftingPanel.container.visible = this.state.craftingMenuOpen;
  }

  private getSelectedRecipeForItem(itemTypeId: ResourceId): ItemRecipeContent {
    const recipe = getItemContent(itemTypeId)?.recipe;
    if (!recipe) {
      throw new Error(`Expected craft recipe for ${itemTypeId}.`);
    }
    return recipe;
  }
}

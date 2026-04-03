import * as PIXI from "pixijs";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type {
  GameClient,
  PointerInput,
} from "@client/client/GameClient.ts";
import {
  CraftingModal,
  type CraftingModalEntry,
} from "@client/render/hud/CraftingModal.ts";
import { DayNightIndicator } from "@client/render/hud/DayNightIndicator.ts";
import { HudPanel } from "@client/render/hud/HudPanel.ts";
import { HotbarView } from "@client/render/hud/HotbarView.ts";
import {
  findCraftingStationAtWorldPoint,
  hasNearbyCraftingStation,
  isPlayerNearCraftingStation,
} from "@client/render/hud/craftingStationInteraction.ts";
import {
  buildEffectPanelContent,
  buildResourcePanelContent,
  buildStatusPanelContent,
} from "@client/render/hud/hudPanelModels.ts";
import {
  computeHotbarActiveIndex,
  resolveHotbarEntries,
  syncActiveBuildSelection,
  toHotbarSlotItems,
  type HotbarEntry,
} from "@client/render/hud/hotbarModel.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const HOTBAR_SLOT_COUNT = 10;
const HOTBAR_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export type HudState = {
  craftingMenuOpen: boolean;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  selectedHotbarSlot: number | null;
  activeBuildItemTypeId: ResourceId | null;
};

type PixiHudOptions = {
  gameClient: GameClient;
  selectors: GameSelectors;
};

type TextStyleOptions = Partial<PIXI.ITextStyle>;

export class PixiHud {
  private readonly gameClient: GameClient;
  private readonly selectors: GameSelectors;
  private readonly state: HudState;
  private root: PIXI.Container | null = null;
  private statusPanel?: HudPanel;
  private resourcePanel?: HudPanel;
  private effectPanel?: HudPanel;
  private hotbarView?: HotbarView;
  private craftModalView?: CraftingModal;
  private dayNightIndicator?: DayNightIndicator;
  private visible = false;
  private dirty = true;
  private hoveredCraftItemTypeId: ResourceId | null = null;
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

  constructor({ gameClient, selectors }: PixiHudOptions) {
    this.gameClient = gameClient;
    this.selectors = selectors;

    const defaultCraftItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[0];
    if (!defaultCraftItemTypeId) {
      throw new Error(
        "Expected at least one craftable item in shared content.",
      );
    }

    this.state = {
      craftingMenuOpen: false,
      selectedCraft: defaultCraftItemTypeId,
      previewedCraft: defaultCraftItemTypeId,
      selectedHotbarSlot: null,
      activeBuildItemTypeId: null,
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
        shortcutLabels: HOTBAR_SHORTCUTS,
        iconProvider: (typeId) => this.gameClient.renderer.getItemTexture(typeId),
      });
      this.craftModalView = new CraftingModal({
        titleStyle: new PIXI.TextStyle(this.titleStyle),
        detailTitleStyle: new PIXI.TextStyle({
          ...this.bodyStrongStyle,
          fontSize: 22,
        }),
        detailBodyStyle: new PIXI.TextStyle(this.bodyStyle),
        tileLabelStyle: new PIXI.TextStyle({
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 12,
          fill: 0xf1f6ef,
          align: "center",
        }),
      });
      this.dayNightIndicator = new DayNightIndicator(this.dayNightLabelStyle);

      this.root.addChild(
        this.statusPanel.container,
        this.resourcePanel.container,
        this.effectPanel.container,
        this.hotbarView.container,
        this.craftModalView.container,
        this.dayNightIndicator.container,
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

  public toggleCraftingMenu(): void {
    if (this.state.craftingMenuOpen) {
      this.closeCraftingMenu();
      return;
    }

    if (!this.hasNearbyCraftingStation()) {
      return;
    }

    this.openCraftingMenu();
  }

  public selectHotbarItemByOrdinal(ordinal: number): boolean {
    if (this.state.craftingMenuOpen) {
      return false;
    }

    const slotIndex = ordinal - 1;
    if (slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
      return false;
    }

    const hotbarEntries = resolveHotbarEntries(
      this.selectors,
      HOTBAR_SLOT_COUNT,
    );
    const entry = hotbarEntries[slotIndex];
    if (!entry) {
      return false;
    }

    if (entry.kind === "weapon") {
      this.state.selectedHotbarSlot = slotIndex;
      this.state.activeBuildItemTypeId = null;
      this.gameClient.queueSelectWeaponIndex(entry.weaponIndex);
    } else {
      if (entry.count <= 0) {
        return false;
      }
      this.state.selectedHotbarSlot = slotIndex;
      this.state.activeBuildItemTypeId = entry.typeId;
      this.gameClient.clearPendingWeaponSelection();
    }
    this.markDirty();
    return true;
  }

  public moveCraftSelection(delta: number): boolean {
    if (!this.state.craftingMenuOpen || delta === 0) {
      return false;
    }

    const currentIndex = Math.max(
      0,
      CRAFTABLE_ITEM_TYPE_IDS.indexOf(this.state.selectedCraft),
    );
    const nextIndex = clamp(
      currentIndex + delta,
      0,
      CRAFTABLE_ITEM_TYPE_IDS.length - 1,
    );
    const nextCraft = CRAFTABLE_ITEM_TYPE_IDS[nextIndex];
    if (!nextCraft) {
      return false;
    }

    this.hoveredCraftItemTypeId = null;
    this.state.selectedCraft = nextCraft;
    this.state.previewedCraft = nextCraft;
    this.markDirty();
    return true;
  }

  public queueSelectedCraft(): void {
    if (!this.state.craftingMenuOpen) {
      return;
    }

    if (!this.canSubmitCraft(this.state.selectedCraft)) {
      this.markDirty();
      return;
    }

    this.gameClient.queueCraftItem(this.state.selectedCraft);
    this.markDirty();
  }

  public handlePointerInput(pointer: PointerInput): boolean {
    if (pointer.kind === "move") {
      return this.handlePointerMove(pointer);
    }
    return this.handlePointerDown(pointer);
  }

  public reset(): void {
    this.state.craftingMenuOpen = false;
    this.state.selectedHotbarSlot = null;
    this.state.activeBuildItemTypeId = null;
    this.hoveredCraftItemTypeId = null;
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppressed(false);
    this.markDirty();
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
    this.syncCraftingBenchProximity();
    const hotbarEntries = resolveHotbarEntries(
      this.selectors,
      HOTBAR_SLOT_COUNT,
    );
    syncActiveBuildSelection(this.state, hotbarEntries);
    const hotbarActiveIndex = computeHotbarActiveIndex({
      hotbarEntries,
      selectedHotbarSlot: this.state.selectedHotbarSlot,
      activeBuildItemTypeId: this.state.activeBuildItemTypeId,
      activeWeaponIndex: this.selectors.getInventory()?.activeWeaponIndex ?? null,
      pendingWeaponIndex: this.gameClient.inputManager.pendingSelectWeaponIndex,
    });
    if (hotbarActiveIndex !== this.lastHotbarActiveIndex) {
      this.dirty = true;
    }

    if (!this.dirty && !force && !sizeChanged) {
      return;
    }

    this.lastLayoutWidth = app.screen.width;
    this.lastLayoutHeight = app.screen.height;
    this.dirty = false;

    this.syncPanels(hotbarEntries, hotbarActiveIndex);
    this.syncCraftModal(app.screen.width, app.screen.height);
    this.syncDayNight();
    this.layoutPanels(app.screen.width, app.screen.height);
  }

  public markDirty(): void {
    this.dirty = true;
  }

  private handlePointerMove(pointer: PointerInput): boolean {
    if (!this.state.craftingMenuOpen || !this.craftModalView) {
      return false;
    }

    const hoveredCraft = this.craftModalView.getCraftAtPoint(
      pointer.screenX,
      pointer.screenY,
    );
    if (hoveredCraft === this.hoveredCraftItemTypeId) {
      return true;
    }

    this.hoveredCraftItemTypeId = hoveredCraft;
    this.state.previewedCraft = hoveredCraft ?? this.state.selectedCraft;
    this.markDirty();
    return true;
  }

  private handlePointerDown(pointer: PointerInput): boolean {
    if (this.state.craftingMenuOpen) {
      this.handleCraftModalPointerDown(pointer.screenX, pointer.screenY);
      return true;
    }

    const clickedStation = findCraftingStationAtWorldPoint(
      this.selectors.getCraftingStations(),
      pointer.worldX,
      pointer.worldY,
    );
    if (
      clickedStation &&
      isPlayerNearCraftingStation(
        this.selectors.getPlayerEntity(),
        clickedStation,
      )
    ) {
      this.openCraftingMenu();
      return true;
    }

    const activeBuildItemTypeId = this.state.activeBuildItemTypeId;
    if (activeBuildItemTypeId) {
      this.gameClient.queueBuildPlacement(
        activeBuildItemTypeId,
        pointer.worldX,
        pointer.worldY,
      );
      return true;
    }

    return false;
  }

  private handleCraftModalPointerDown(
    screenX: number,
    screenY: number,
  ): void {
    if (this.craftModalView?.isCraftButtonAtPoint(screenX, screenY)) {
      const craftTarget = this.state.previewedCraft;
      this.state.selectedCraft = craftTarget;
      if (this.canSubmitCraft(craftTarget)) {
        this.gameClient.queueCraftItem(craftTarget);
      }
      this.markDirty();
      return;
    }

    const clickedCraft = this.craftModalView?.getCraftAtPoint(screenX, screenY);
    if (!clickedCraft) {
      return;
    }

    this.hoveredCraftItemTypeId = clickedCraft;
    this.state.selectedCraft = clickedCraft;
    this.state.previewedCraft = clickedCraft;
    if (this.canSubmitCraft(clickedCraft)) {
      this.gameClient.queueCraftItem(clickedCraft);
    }
    this.markDirty();
  }

  private openCraftingMenu(): void {
    this.state.craftingMenuOpen = true;
    this.state.previewedCraft = this.state.selectedCraft;
    this.hoveredCraftItemTypeId = null;
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppressed(true);
    this.markDirty();
  }

  private closeCraftingMenu(): void {
    this.state.craftingMenuOpen = false;
    this.state.previewedCraft = this.state.selectedCraft;
    this.hoveredCraftItemTypeId = null;
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppressed(false);
    this.markDirty();
  }

  private syncPanels(
    hotbarEntries: HotbarEntry[],
    hotbarActiveIndex: number | null,
  ): void {
    if (
      !this.statusPanel ||
      !this.resourcePanel ||
      !this.effectPanel ||
      !this.hotbarView
    ) {
      return;
    }

    const playerEntity = this.selectors.getPlayerEntity();
    const worldEntities = this.selectors.getWorldEntities();
    const buildings = this.selectors.getTrackedBuildings();
    const activeEffectLabels = this.selectors.getActiveEffectLabels();
    const performanceRates = this.gameClient.getMeasuredRates();

    const statusContent = buildStatusPanelContent({
      playerEntity,
      latestTick: this.gameClient.worldState?.latestTick ?? 0,
      structureCount: buildings.length,
      entityCount: worldEntities.length,
      tickRate: performanceRates.tickRate,
      frameRate: performanceRates.frameRate,
    });
    this.statusPanel.setContent(statusContent.title, statusContent.body, {
      minWidth: statusContent.minWidth,
      maxWidth: statusContent.maxWidth,
    });

    const resourceContent = buildResourcePanelContent({
      formatTypeLabel: (typeId) => this.selectors.formatTypeLabel(typeId),
      countInventoryType: (typeId) => this.selectors.countInventoryType(typeId),
    });
    this.resourcePanel.setContent(resourceContent.title, resourceContent.body, {
      minWidth: resourceContent.minWidth,
      maxWidth: resourceContent.maxWidth,
    });

    const effectContent = buildEffectPanelContent(activeEffectLabels);
    this.effectPanel.setContent(effectContent.title, effectContent.body, {
      minWidth: effectContent.minWidth,
      maxWidth: effectContent.maxWidth,
    });

    this.hotbarView.setSlots(
      toHotbarSlotItems(hotbarEntries, HOTBAR_SLOT_COUNT),
      hotbarActiveIndex,
    );
    this.lastHotbarActiveIndex = hotbarActiveIndex;
  }

  private syncCraftModal(screenWidth: number, screenHeight: number): void {
    if (!this.craftModalView) {
      return;
    }

    const craftEntries = CRAFTABLE_ITEM_TYPE_IDS.map((itemTypeId) => {
      const recipe = this.getRecipeForItem(itemTypeId);
      return {
        typeId: itemTypeId,
        label: this.selectors.formatTypeLabel(itemTypeId),
        description:
          recipe.hint ??
          "Assemble this item at a nearby crafting station.",
        costsLabel: this.selectors.formatCosts(recipe.costs),
        outputAmount: recipe.outputAmount,
        available: this.selectors.hasRecipeResources(recipe),
      } satisfies CraftingModalEntry;
    });

    const craftAvailability = this.describeCraftAvailability(
      this.state.previewedCraft,
    );

    this.craftModalView.sync({
      screenWidth,
      screenHeight,
      entries: craftEntries,
      selectedCraft: this.state.selectedCraft,
      previewedCraft: this.state.previewedCraft,
      iconProvider: (typeId) => this.gameClient.renderer.getItemTexture(typeId),
      craftButtonEnabled: craftAvailability.enabled,
      previewStatusLabel: craftAvailability.statusLabel,
      visible: this.state.craftingMenuOpen,
    });
  }

  private layoutPanels(screenWidth: number, screenHeight: number): void {
    if (
      !this.statusPanel ||
      !this.resourcePanel ||
      !this.effectPanel ||
      !this.hotbarView ||
      !this.dayNightIndicator
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

    this.dayNightIndicator.setPosition(
      Math.floor((screenWidth - this.dayNightIndicator.width) / 2),
      padding,
    );
  }

  private syncDayNight(): void {
    if (!this.dayNightIndicator) {
      return;
    }
    this.dayNightIndicator.sync(
      this.selectors.getDayNight(),
      this.gameClient.worldState?.latestSnapshotReceivedAt,
    );
  }

  private hasNearbyCraftingStation(): boolean {
    return hasNearbyCraftingStation(
      this.selectors.getPlayerEntity(),
      this.selectors.getCraftingStations(),
    );
  }

  private syncCraftingBenchProximity(): void {
    if (this.state.craftingMenuOpen && !this.hasNearbyCraftingStation()) {
      this.closeCraftingMenu();
    }
  }

  private canSubmitCraft(itemTypeId: ResourceId): boolean {
    if (!this.hasNearbyCraftingStation()) {
      return false;
    }

    return this.selectors.hasRecipeResources(this.getRecipeForItem(itemTypeId));
  }

  private describeCraftAvailability(itemTypeId: ResourceId): {
    enabled: boolean;
    statusLabel: string;
  } {
    if (!this.hasNearbyCraftingStation()) {
      return {
        enabled: false,
        statusLabel: "Move closer to a crafting station",
      };
    }

    if (!this.selectors.hasRecipeResources(this.getRecipeForItem(itemTypeId))) {
      return {
        enabled: false,
        statusLabel: "Missing materials",
      };
    }

    return {
      enabled: true,
      statusLabel: "Ready to craft",
    };
  }

  private getRecipeForItem(itemTypeId: ResourceId): ItemRecipeContent {
    const recipe = getItemContent(itemTypeId)?.recipe;
    if (!recipe) {
      throw new Error(`Expected craft recipe for ${itemTypeId}.`);
    }
    return recipe;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

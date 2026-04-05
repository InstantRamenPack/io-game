import * as PIXI from "pixijs";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient, PointerInput } from "@client/client/GameClient.ts";
import {
  CraftingModal,
  type CraftingModalEntry,
} from "@client/render/hud/CraftingModal.ts";
import { CombatHudView } from "@client/render/hud/CombatHudView.ts";
import { DayNightIndicator } from "@client/render/hud/DayNightIndicator.ts";
import { EffectIconView } from "@client/render/hud/EffectIconView.ts";
import { HudPanel } from "@client/render/hud/HudPanel.ts";
import { HudTooltipView } from "@client/render/hud/HudTooltipView.ts";
import { HotbarView } from "@client/render/hud/HotbarView.ts";
import { InventoryView } from "@client/render/hud/InventoryView.ts";
import { ResourceStackView } from "@client/render/hud/ResourceStackView.ts";
import { SelectedItemToastView } from "@client/render/hud/SelectedItemToastView.ts";
import {
  findCraftingStationAtWorldPoint,
  hasNearbyCraftingStation,
  isPlayerNearCraftingStation,
} from "@client/render/hud/craftingStationInteraction.ts";
import { buildStatusPanelContent } from "@client/render/hud/hudPanelModels.ts";
import {
  buildActiveEffectEntries,
  buildCombatHudModel,
  buildCraftTooltipContent,
  buildInventoryTooltipContent,
  buildSelectedItemLabel,
} from "@client/render/hud/hudPresentationModels.ts";
import {
  computeHotbarActiveIndex,
  toHotbarSlotItems,
} from "@client/render/hud/hotbarModel.ts";
import { sanitizeHotbarEditState as sanitizeHotbarEditInteraction } from "@client/render/hud/hotbarEditModel.ts";
import {
  buildResourceStackEntries,
  syncDiscoveredResources as syncResourceStackModel,
} from "@client/render/hud/resourceStackModel.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";

const HOTBAR_SLOT_COUNT = 10;
const HOTBAR_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export type HudState = {
  craftingMenuOpen: boolean;
  inventoryOpen: boolean;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  hoveredInventorySlotIndex: number | null;
  heldInventorySlotIndex: number | null;
};

type PixiHudOptions = {
  gameClient: GameClient;
  selectors: GameSelectors;
};

type TextStyleOptions = Partial<PIXI.ITextStyle>;
type ScreenRect = { x: number; y: number; width: number; height: number };

export class PixiHud {
  private readonly gameClient: GameClient;
  private readonly selectors: GameSelectors;
  private readonly state: HudState;
  private root: PIXI.Container | null = null;
  private statusPanel?: HudPanel;
  private effectDetailPanel?: HudPanel;
  private effectIconView?: EffectIconView;
  private combatHudView?: CombatHudView;
  private hotbarView?: HotbarView;
  private hotbarEditView?: InventoryView;
  private resourceStackView?: ResourceStackView;
  private craftModalView?: CraftingModal;
  private tooltipView?: HudTooltipView;
  private selectedItemToastView?: SelectedItemToastView;
  private dayNightIndicator?: DayNightIndicator;
  private visible = false;
  private dirty = true;
  private hoveredCraftItemTypeId: ResourceId | null = null;
  private hoveredCraftPreview = false;
  private lastLayoutWidth = 0;
  private lastLayoutHeight = 0;
  private lastHotbarActiveIndex: number | null = null;
  private draggedInventorySlotIndex: number | null = null;
  private selectedItemToastLabel: string | null = null;
  private selectedItemToastShownAtMs = 0;
  private hasSeenInitialHotbarSelection = false;
  private readonly discoveredResourceTypeIds: ResourceId[] = [];
  private readonly resourceCounts = new Map<ResourceId, number>();
  private readonly selectionToastDurationMs = 1600;
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
      inventoryOpen: false,
      selectedCraft: defaultCraftItemTypeId,
      previewedCraft: defaultCraftItemTypeId,
      hoveredInventorySlotIndex: null,
      heldInventorySlotIndex: null,
    };
  }

  public attach(app: PIXI.Application<HTMLCanvasElement>): void {
    if (!this.root) {
      this.root = new PIXI.Container();
      this.statusPanel = new HudPanel(this.titleStyle, this.bodyStrongStyle);
      this.effectDetailPanel = new HudPanel(this.titleStyle, this.bodyStyle);
      this.effectIconView = new EffectIconView({
        iconProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
      });
      this.combatHudView = new CombatHudView({
        ammoTextureProvider: () =>
          this.gameClient.renderer.getItemTexture("item:gun_mag"),
      });
      this.hotbarView = new HotbarView({
        slotCount: HOTBAR_SLOT_COUNT,
        shortcutLabels: HOTBAR_SHORTCUTS,
        iconProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
      });
      this.hotbarEditView = new InventoryView({
        iconProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
      });
      this.resourceStackView = new ResourceStackView({
        iconProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
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
      this.tooltipView = new HudTooltipView();
      this.selectedItemToastView = new SelectedItemToastView();
      this.dayNightIndicator = new DayNightIndicator(this.dayNightLabelStyle);

      this.root.addChild(
        this.statusPanel.container,
        this.effectIconView.container,
        this.effectDetailPanel.container,
        this.combatHudView.container,
        this.hotbarView.container,
        this.resourceStackView.container,
        this.hotbarEditView.container,
        this.craftModalView.container,
        this.dayNightIndicator.container,
        this.selectedItemToastView.container,
        this.tooltipView.container,
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

    if (this.state.inventoryOpen) {
      this.closeInventory();
    }

    if (!this.hasNearbyCraftingStation()) {
      return;
    }

    this.openCraftingMenu();
  }

  public toggleInventory(): void {
    if (this.state.inventoryOpen) {
      this.closeInventory();
      return;
    }

    if (this.state.craftingMenuOpen) {
      this.closeCraftingMenu();
    }

    this.openInventory();
  }

  public selectHotbarItemByOrdinal(ordinal: number): boolean {
    const slotIndex = ordinal - 1;
    if (slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
      return false;
    }

    if (this.state.inventoryOpen) {
      if (this.state.hoveredInventorySlotIndex === null) {
        return false;
      }
      this.gameClient.queueInventoryMove(
        this.state.hoveredInventorySlotIndex,
        slotIndex,
      );
      this.clearInventoryDragState();
      this.markDirty();
      return true;
    }

    if (this.state.craftingMenuOpen) {
      return false;
    }

    this.gameClient.queueSelectHotbarIndex(slotIndex);
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
    if (this.state.inventoryOpen) {
      return this.handleHotbarEditPointer(pointer);
    }

    if (pointer.kind === "move") {
      return this.handleCraftingPointerMove(pointer);
    }
    if (pointer.kind === "up") {
      return false;
    }
    return this.handleGameplayPointerDown(pointer);
  }

  public reset(): void {
    this.state.craftingMenuOpen = false;
    this.state.inventoryOpen = false;
    this.state.hoveredInventorySlotIndex = null;
    this.state.heldInventorySlotIndex = null;
    this.draggedInventorySlotIndex = null;
    this.hoveredCraftItemTypeId = null;
    this.hoveredCraftPreview = false;
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppressed(false);
    this.markDirty();
  }

  public isCraftingMenuOpen(): boolean {
    return this.state.craftingMenuOpen;
  }

  public isInventoryOpen(): boolean {
    return this.state.inventoryOpen;
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
    this.syncResourceStackState();
    this.sanitizeHotbarEditState();
    const nowMs = performance.now();
    const inventory = this.selectors.getInventory();
    const hotbarActiveIndex = computeHotbarActiveIndex({
      inventory,
      pendingHotbarIndex: undefined,
    });
    if (hotbarActiveIndex !== this.lastHotbarActiveIndex) {
      this.handleHotbarSelectionChange(inventory, hotbarActiveIndex, nowMs);
      this.dirty = true;
    }
    const selectionToastVisible = this.isSelectionToastVisible(nowMs);

    if (!this.dirty && !force && !sizeChanged && !selectionToastVisible) {
      return;
    }

    this.lastLayoutWidth = app.screen.width;
    this.lastLayoutHeight = app.screen.height;
    this.dirty = false;

    this.syncPanels(hotbarActiveIndex);
    this.syncHotbarEditView(app.screen.width, app.screen.height);
    this.syncCraftModal(app.screen.width, app.screen.height);
    this.syncDayNight();
    this.syncSelectedItemToast(nowMs);
    this.layoutPanels(app.screen.width, app.screen.height);
    this.syncTooltip(app.screen.width, app.screen.height);
  }

  public markDirty(): void {
    this.dirty = true;
  }

  private handleHotbarEditPointer(pointer: PointerInput): boolean {
    const hoveredSlotIndex =
      this.hotbarEditView?.getSlotIndexAtPoint(
        pointer.screenX,
        pointer.screenY,
      ) ?? null;
    if (hoveredSlotIndex !== this.state.hoveredInventorySlotIndex) {
      this.state.hoveredInventorySlotIndex = hoveredSlotIndex;
      this.markDirty();
    }

    if (pointer.kind === "move") {
      return true;
    }

    if (pointer.kind === "up") {
      if (
        this.draggedInventorySlotIndex !== null &&
        hoveredSlotIndex !== null &&
        hoveredSlotIndex !== this.draggedInventorySlotIndex
      ) {
        this.gameClient.queueInventoryMove(
          this.draggedInventorySlotIndex,
          hoveredSlotIndex,
        );
        this.clearInventoryDragState();
        this.markDirty();
      }
      this.draggedInventorySlotIndex = null;
      return true;
    }

    if (hoveredSlotIndex === null) {
      this.clearInventoryDragState();
      this.markDirty();
      return true;
    }

    const item = this.getHotbarItems()[hoveredSlotIndex];
    if (this.state.heldInventorySlotIndex !== null) {
      if (this.state.heldInventorySlotIndex === hoveredSlotIndex) {
        this.draggedInventorySlotIndex = hoveredSlotIndex;
        return true;
      }

      this.gameClient.queueInventoryMove(
        this.state.heldInventorySlotIndex,
        hoveredSlotIndex,
      );
      this.clearInventoryDragState();
      this.markDirty();
      return true;
    }

    if (!item?.typeId) {
      return true;
    }

    this.state.heldInventorySlotIndex = hoveredSlotIndex;
    this.draggedInventorySlotIndex = hoveredSlotIndex;
    this.markDirty();
    return true;
  }

  private handleCraftingPointerMove(pointer: PointerInput): boolean {
    if (!this.state.craftingMenuOpen || !this.craftModalView) {
      return false;
    }

    const hoveredCraftTile = this.craftModalView.getCraftAtPoint(
      pointer.screenX,
      pointer.screenY,
    );
    const hoveredPreviewCraft =
      hoveredCraftTile === null
        ? this.craftModalView.getPreviewedCraftAtPoint(
            pointer.screenX,
            pointer.screenY,
            this.state.previewedCraft,
          )
        : null;
    const nextHoveredCraft = hoveredCraftTile ?? hoveredPreviewCraft;
    const nextHoveredCraftPreview =
      hoveredCraftTile === null && hoveredPreviewCraft !== null;
    if (
      nextHoveredCraft === this.hoveredCraftItemTypeId &&
      nextHoveredCraftPreview === this.hoveredCraftPreview
    ) {
      return true;
    }

    this.hoveredCraftItemTypeId = nextHoveredCraft;
    this.hoveredCraftPreview = nextHoveredCraftPreview;
    this.state.previewedCraft = nextHoveredCraft ?? this.state.selectedCraft;
    this.markDirty();
    return true;
  }

  private handleGameplayPointerDown(pointer: PointerInput): boolean {
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

    const inventory = this.selectors.getInventory();
    const selectedSlot =
      inventory?.hotbarSlots[inventory.selectedHotbarIndex ?? 0] ?? null;
    if (selectedSlot?.kind === "buildable") {
      this.gameClient.queueBuildPlacement(pointer.worldX, pointer.worldY);
      return true;
    }

    return false;
  }

  private handleCraftModalPointerDown(screenX: number, screenY: number): void {
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
    this.hoveredCraftPreview = false;
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
    this.hoveredCraftPreview = false;
    this.syncOverlaySuppression();
    this.markDirty();
  }

  private closeCraftingMenu(): void {
    this.state.craftingMenuOpen = false;
    this.state.previewedCraft = this.state.selectedCraft;
    this.hoveredCraftItemTypeId = null;
    this.hoveredCraftPreview = false;
    this.syncOverlaySuppression();
    this.markDirty();
  }

  private openInventory(): void {
    this.state.inventoryOpen = true;
    this.clearInventoryDragState();
    this.syncOverlaySuppression();
    this.markDirty();
  }

  private closeInventory(): void {
    this.state.inventoryOpen = false;
    this.clearInventoryDragState();
    this.syncOverlaySuppression();
    this.markDirty();
  }

  private clearInventoryDragState(): void {
    this.state.heldInventorySlotIndex = null;
    this.draggedInventorySlotIndex = null;
  }

  private syncOverlaySuppression(): void {
    const suppressed = this.state.craftingMenuOpen || this.state.inventoryOpen;
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppressed(suppressed);
  }

  private syncPanels(hotbarActiveIndex: number | null): void {
    if (
      !this.statusPanel ||
      !this.effectDetailPanel ||
      !this.effectIconView ||
      !this.combatHudView ||
      !this.hotbarView ||
      !this.resourceStackView
    ) {
      return;
    }

    const playerEntity = this.selectors.getPlayerEntity();
    const worldEntities = this.selectors.getWorldEntities();
    const buildings = this.selectors.getTrackedBuildings();
    const performanceRates = this.gameClient.getMeasuredRates();
    const activeEffectEntries = buildActiveEffectEntries({
      activeEffects: playerEntity?.activeEffects,
      tickRate: this.gameClient.gameConfig.tickRate,
    });

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

    this.effectDetailPanel.setContent(
      "Effects",
      activeEffectEntries.length > 0
        ? activeEffectEntries
            .map(
              (entry) =>
                `${entry.label}: ${entry.secondsRemaining.toFixed(1)}s`,
            )
            .join("\n")
        : "No active effects",
      {
        minWidth: 220,
        maxWidth: 260,
      },
    );
    this.effectDetailPanel.container.visible = this.state.inventoryOpen;
    this.effectIconView.sync(activeEffectEntries);

    const inventory = this.selectors.getInventory();
    const activeSlot =
      hotbarActiveIndex !== null
        ? (inventory?.hotbarSlots[hotbarActiveIndex] ?? null)
        : null;
    this.combatHudView.sync(
      buildCombatHudModel({
        playerEntity,
        activeSlot,
      }),
      this.hotbarView.width,
    );

    this.hotbarView.setSlots(this.getHotbarItems(), hotbarActiveIndex);
    this.lastHotbarActiveIndex = hotbarActiveIndex;
    this.resourceStackView.sync(
      buildResourceStackEntries({
        discoveredResourceTypeIds: this.discoveredResourceTypeIds,
        resourceCounts: this.resourceCounts,
      }),
    );
  }

  private syncTooltip(screenWidth: number, screenHeight: number): void {
    if (!this.tooltipView) {
      return;
    }

    const tooltipState = this.getTooltipState();
    this.tooltipView.sync(tooltipState?.content ?? null);
    if (!tooltipState) {
      return;
    }

    const tooltipX =
      tooltipState.rect.x +
        tooltipState.rect.width +
        this.tooltipView.width +
        12 <=
      screenWidth - 12
        ? tooltipState.rect.x + tooltipState.rect.width + 12
        : Math.max(12, tooltipState.rect.x - this.tooltipView.width - 12);
    const tooltipY = clamp(
      tooltipState.rect.y,
      12,
      Math.max(12, screenHeight - this.tooltipView.height - 12),
    );
    this.tooltipView.setPosition(tooltipX, tooltipY);
  }

  private syncSelectedItemToast(nowMs: number): void {
    if (!this.selectedItemToastView) {
      return;
    }

    const alpha = this.getSelectionToastAlpha(nowMs);
    this.selectedItemToastView.sync(this.selectedItemToastLabel, alpha);
  }

  private getTooltipState():
    | {
        content: ReturnType<typeof buildInventoryTooltipContent>;
        rect: ScreenRect;
      }
    | {
        content: ReturnType<typeof buildCraftTooltipContent>;
        rect: ScreenRect;
      }
    | null {
    if (
      this.state.inventoryOpen &&
      this.hotbarEditView &&
      this.state.hoveredInventorySlotIndex !== null
    ) {
      const slot =
        this.selectors.getInventory()?.hotbarSlots[
          this.state.hoveredInventorySlotIndex
        ];
      const rect = this.hotbarEditView.getSlotRect(
        this.state.hoveredInventorySlotIndex,
      );
      const content = slot ? buildInventoryTooltipContent(slot) : null;
      if (rect && content) {
        return { content, rect };
      }
    }

    if (
      this.state.craftingMenuOpen &&
      this.craftModalView &&
      this.hoveredCraftItemTypeId !== null
    ) {
      const entry = this.buildCraftEntries().find(
        (item) => item.typeId === this.hoveredCraftItemTypeId,
      );
      if (!entry) {
        return null;
      }
      const rect = this.hoveredCraftPreview
        ? this.craftModalView.getPreviewRect()
        : this.craftModalView.getCraftRect(this.hoveredCraftItemTypeId);
      if (!rect) {
        return null;
      }
      return {
        content: buildCraftTooltipContent(entry),
        rect,
      };
    }

    return null;
  }

  private handleHotbarSelectionChange(
    inventory: InventorySnapshot | undefined,
    hotbarActiveIndex: number | null,
    nowMs: number,
  ): void {
    if (hotbarActiveIndex === null) {
      this.hasSeenInitialHotbarSelection = false;
      return;
    }

    const slot = inventory?.hotbarSlots[hotbarActiveIndex] ?? null;
    if (!this.hasSeenInitialHotbarSelection) {
      this.hasSeenInitialHotbarSelection = true;
      return;
    }

    this.selectedItemToastLabel = buildSelectedItemLabel(slot);
    this.selectedItemToastShownAtMs = nowMs;
  }

  private isSelectionToastVisible(nowMs: number): boolean {
    return (
      this.selectedItemToastLabel !== null &&
      nowMs - this.selectedItemToastShownAtMs < this.selectionToastDurationMs
    );
  }

  private getSelectionToastAlpha(nowMs: number): number {
    if (!this.isSelectionToastVisible(nowMs)) {
      return 0;
    }

    const elapsedMs = nowMs - this.selectedItemToastShownAtMs;
    const holdDurationMs = 850;
    const fadeDurationMs = this.selectionToastDurationMs - holdDurationMs;
    if (elapsedMs <= holdDurationMs) {
      return 1;
    }

    return clamp(1 - (elapsedMs - holdDurationMs) / fadeDurationMs, 0, 1);
  }

  private buildCraftEntries(): CraftingModalEntry[] {
    return CRAFTABLE_ITEM_TYPE_IDS.map((itemTypeId) => {
      const recipe = this.getRecipeForItem(itemTypeId);
      return {
        typeId: itemTypeId,
        label: this.selectors.formatTypeLabel(itemTypeId),
        description:
          recipe.hint ?? "Assemble this item at a nearby crafting station.",
        costsLabel: this.selectors.formatCosts(recipe.costs),
        outputAmount: recipe.outputAmount,
        available: this.selectors.hasRecipeResources(recipe),
      } satisfies CraftingModalEntry;
    });
  }

  private syncHotbarEditView(screenWidth: number, screenHeight: number): void {
    if (!this.hotbarEditView) {
      return;
    }

    const inventory = this.selectors.getInventory();
    this.hotbarEditView.sync({
      visible: this.state.inventoryOpen,
      screenWidth,
      screenHeight,
      hotbarItems: this.getHotbarItems(),
      selectedHotbarIndex: inventory?.selectedHotbarIndex ?? 0,
      hoveredSlotIndex: this.state.hoveredInventorySlotIndex,
      heldSlotIndex: this.state.heldInventorySlotIndex,
    });
  }

  private syncCraftModal(screenWidth: number, screenHeight: number): void {
    if (!this.craftModalView) {
      return;
    }

    const craftEntries = this.buildCraftEntries();

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
      !this.effectDetailPanel ||
      !this.effectIconView ||
      !this.combatHudView ||
      !this.hotbarView ||
      !this.selectedItemToastView ||
      !this.dayNightIndicator ||
      !this.resourceStackView
    ) {
      return;
    }

    const padding = 16;
    const gap = 12;

    this.statusPanel.setPosition(padding, padding);
    this.effectIconView.setPosition(
      screenWidth - padding - this.effectIconView.width,
      padding,
    );
    this.resourceStackView.setPosition(
      screenWidth - padding - this.resourceStackView.width,
      screenHeight - padding - this.resourceStackView.height,
    );

    this.hotbarView.setPosition(
      Math.floor((screenWidth - this.hotbarView.width) / 2),
      screenHeight - padding - this.hotbarView.height,
    );
    this.combatHudView.setPosition(
      this.hotbarView.container.x,
      this.hotbarView.container.y - gap - this.combatHudView.height,
    );
    this.selectedItemToastView.setPosition(
      Math.floor((screenWidth - this.selectedItemToastView.width) / 2),
      this.combatHudView.container.y - 10 - this.selectedItemToastView.height,
    );

    const inventoryPanelRect = this.hotbarEditView?.getPanelRect();
    if (inventoryPanelRect && this.state.inventoryOpen) {
      this.effectDetailPanel.setPosition(
        Math.floor((screenWidth - this.effectDetailPanel.width) / 2),
        Math.max(
          padding,
          inventoryPanelRect.y - gap - this.effectDetailPanel.height,
        ),
      );
      this.effectDetailPanel.container.visible = true;
    } else {
      this.effectDetailPanel.container.visible = false;
    }

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

  private sanitizeHotbarEditState(): void {
    const { hoveredSlotIndex, heldSlotIndex } = sanitizeHotbarEditInteraction({
      inventoryOpen: this.state.inventoryOpen,
      hoveredSlotIndex: this.state.hoveredInventorySlotIndex,
      heldSlotIndex: this.state.heldInventorySlotIndex,
      hotbarItems: this.getHotbarItems(),
    });

    this.state.hoveredInventorySlotIndex = hoveredSlotIndex;
    this.state.heldInventorySlotIndex = heldSlotIndex;
    if (!this.state.inventoryOpen || heldSlotIndex === null) {
      this.draggedInventorySlotIndex = null;
    }
  }

  private syncResourceStackState(): void {
    syncResourceStackModel({
      inventory: this.selectors.getInventory(),
      discoveredResourceTypeIds: this.discoveredResourceTypeIds,
      resourceCounts: this.resourceCounts,
    });
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

  private getHotbarItems() {
    return toHotbarSlotItems(
      this.selectors.getInventory()?.hotbarSlots ?? emptyHotbarSlots(),
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyHotbarSlots(): InventorySnapshot["hotbarSlots"] {
  return Array.from({ length: HOTBAR_SLOT_COUNT }, () => ({ kind: "empty" }));
}

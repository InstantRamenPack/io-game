import * as PIXI from "pixi.js";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type {
  GameClientHudApi,
  PointerInput,
} from "@client/client/clientTypes.ts";
import {
  CraftingModal,
  type CraftingModalEntry,
} from "@client/render/hud/CraftingModal.ts";
import { CombatHudView } from "@client/render/hud/CombatHudView.ts";
import { CraftingHudCoordinator } from "@client/render/hud/CraftingHudCoordinator.ts";
import { ChestView } from "@client/render/hud/ChestView.ts";
import { ChestHudCoordinator } from "@client/render/hud/ChestHudCoordinator.ts";
import { BossHealthBar } from "@client/render/hud/BossHealthBar.ts";
import { DayNightIndicator } from "@client/render/hud/DayNightIndicator.ts";
import { EffectIconView } from "@client/render/hud/EffectIconView.ts";
import { GameplayHudCoordinator } from "@client/render/hud/GameplayHudCoordinator.ts";
import { HudPanel } from "@client/render/hud/HudPanel.ts";
import { HudTooltipCoordinator } from "@client/render/hud/HudTooltipCoordinator.ts";
import { HudTooltipView } from "@client/render/hud/HudTooltipView.ts";
import { HotbarView } from "@client/render/hud/HotbarView.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";
import { InventoryEditCoordinator } from "@client/render/hud/InventoryEditCoordinator.ts";
import { InventoryView } from "@client/render/hud/InventoryView.ts";
import { ChestPromptView } from "@client/render/hud/ChestPromptView.ts";
import { CraftingStationPromptView } from "@client/render/hud/CraftingStationPromptView.ts";
import { ItemPickupPromptView } from "@client/render/hud/ItemPickupPromptView.ts";
import { RecyclerPromptView } from "@client/render/hud/RecyclerPromptView.ts";
import { TowerRepairPromptView } from "@client/render/hud/TowerRepairPromptView.ts";
import { ResourceStackView } from "@client/render/hud/ResourceStackView.ts";
import { SelectedItemToastView } from "@client/render/hud/SelectedItemToastView.ts";
import {
  computeHotbarActiveIndex,
  toHotbarSlotItems,
} from "@client/render/hud/hotbarModel.ts";
import { isNearRecyclerWithItem } from "@client/render/hud/recyclerInteraction.ts";
import {
  getNearestPickup,
  getPickupItemLabel,
} from "@client/render/hud/pickupInteraction.ts";
import { findNearestChest } from "@client/render/hud/chestInteraction.ts";
import { hasNearbyCraftingStation } from "@client/render/hud/craftingStationInteraction.ts";
import { getTowerRepairCost } from "@client/render/hud/towerRepairInteraction.ts";
import type { TextStyleOptions } from "@client/render/renderTypes.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
  isRecipeBlueprintLocked,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";

const HOTBAR_SLOT_COUNT = 10;
const HOTBAR_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export type HudState = HudInteractionState;

type PixiHudOptions = {
  gameClient: GameClientHudApi;
  selectors: GameSelectors;
};

export class PixiHud {
  private readonly gameClient: GameClientHudApi;
  private readonly selectors: GameSelectors;
  private readonly state: HudState;
  private readonly gameplayHudCoordinator = new GameplayHudCoordinator();
  private readonly craftingHudCoordinator = new CraftingHudCoordinator();
  private readonly inventoryEditCoordinator = new InventoryEditCoordinator();
  private readonly chestHudCoordinator = new ChestHudCoordinator();
  private readonly tooltipCoordinator = new HudTooltipCoordinator();

  private root: PIXI.Container | null = null;
  private statusPanel?: HudPanel;
  private effectDetailPanel?: HudPanel;
  private effectIconView?: EffectIconView;
  private combatHudView?: CombatHudView;
  private hotbarView?: HotbarView;
  private hotbarEditView?: InventoryView;
  private chestView?: ChestView;
  private resourceStackView?: ResourceStackView;
  private craftModalView?: CraftingModal;
  private tooltipView?: HudTooltipView;
  private selectedItemToastView?: SelectedItemToastView;
  private dayNightIndicator?: DayNightIndicator;
  private recyclerPromptView?: RecyclerPromptView;
  private towerRepairPromptView?: TowerRepairPromptView;
  private itemPickupPromptView?: ItemPickupPromptView;
  private chestPromptView?: ChestPromptView;
  private craftingStationPromptView?: CraftingStationPromptView;
  private recyclerHoldStartMs: number | null = null;
  private repairHoldStartMs: number | null = null;
  private bossHealthBar?: BossHealthBar;
  private hunkBadge?: PIXI.Container;
  private hunkBadgeBg?: PIXI.Graphics;
  private hunkBadgeIcon?: PIXI.Sprite;
  private hunkBadgeText?: PIXI.Text;
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
      chestOpen: false,
      openChestEntityId: null,
      selectedCraft: defaultCraftItemTypeId,
      previewedCraft: defaultCraftItemTypeId,
      hoveredInventorySlotIndex: null,
      heldInventorySlotIndex: null,
      hoveredChestSlotRef: null,
      heldChestSlotRef: null,
    };
  }

  public setRecyclerHoldStartMs(ms: number | null): void {
    this.recyclerHoldStartMs = ms;
    this.dirty = true;
  }

  public setRepairHoldStartMs(ms: number | null): void {
    this.repairHoldStartMs = ms;
    this.dirty = true;
  }

  public attach(parent: PIXI.Container): void {
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
      this.chestView = new ChestView({
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
      this.recyclerPromptView = new RecyclerPromptView();
      this.towerRepairPromptView = new TowerRepairPromptView();
      this.itemPickupPromptView = new ItemPickupPromptView();
      this.chestPromptView = new ChestPromptView();
      this.craftingStationPromptView = new CraftingStationPromptView();
      this.bossHealthBar = new BossHealthBar();

      this.hunkBadge = new PIXI.Container();
      this.hunkBadgeBg = new PIXI.Graphics();
      this.hunkBadgeIcon = new PIXI.Sprite();
      this.hunkBadgeIcon.anchor.set(0, 0.5);
      this.hunkBadgeText = new PIXI.Text(
        "0",
        new PIXI.TextStyle({
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 14,
          fill: 0xe8f5e7,
          fontWeight: "bold",
        }),
      );
      this.hunkBadgeText.anchor.set(0, 0.5);
      this.hunkBadge.addChild(
        this.hunkBadgeBg,
        this.hunkBadgeIcon,
        this.hunkBadgeText,
      );

      this.root.addChild(
        this.statusPanel.container,
        this.effectIconView.container,
        this.effectDetailPanel.container,
        this.combatHudView.container,
        this.hotbarView.container,
        this.hunkBadge,
        this.resourceStackView.container,
        this.hotbarEditView.container,
        this.chestView.container,
        this.craftModalView.container,
        this.dayNightIndicator.container,
        this.selectedItemToastView.container,
        this.recyclerPromptView.container,
        this.towerRepairPromptView.container,
        this.itemPickupPromptView.container,
        this.chestPromptView.container,
        this.craftingStationPromptView.container,
        this.bossHealthBar.container,
        this.tooltipView.container,
      );
    }

    if (this.root.parent !== parent) {
      parent.addChild(this.root);
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
      this.craftingHudCoordinator.close(this.state);
      this.syncOverlaySuppression();
      this.markDirty();
      return;
    }

    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
    }

    if (!this.hasNearbyCraftingStation()) {
      return;
    }

    this.craftingHudCoordinator.open(this.state);
    this.syncOverlaySuppression();
    this.markDirty();
  }

  public toggleInventory(): void {
    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
      this.syncOverlaySuppression();
      this.markDirty();
      return;
    }

    if (this.state.craftingMenuOpen) {
      this.craftingHudCoordinator.close(this.state);
    }

    this.inventoryEditCoordinator.open(this.state);
    this.syncOverlaySuppression();
    this.markDirty();
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
      this.inventoryEditCoordinator.sanitizeState(
        this.state,
        this.getHotbarItems(),
      );
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
    const visibleCraftableTypeIds = this.getVisibleCraftableTypeIds();
    const moved = this.craftingHudCoordinator.moveSelection(
      this.state,
      delta,
      visibleCraftableTypeIds,
    );
    if (moved) {
      this.markDirty();
    }
    return moved;
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
    if (this.state.chestOpen && this.chestView) {
      const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
        this.state,
        this.selectors,
      );
      const hotbarSlots =
        this.selectors.getInventory()?.hotbarSlots ?? emptyHotbarSlots();
      return this.chestHudCoordinator.handlePointerInput({
        state: this.state,
        pointer,
        getSlotRefAtPoint: (sx, sy) =>
          this.chestView?.getSlotRefAtPoint(sx, sy) ?? null,
        getSlotItem: (ref) => {
          if (ref.source === "chest") {
            const slot = chestSlots?.[ref.index];
            return slot?.kind !== "empty"
              ? { typeId: slot?.typeId ?? null }
              : { typeId: null };
          }
          const slot = hotbarSlots[ref.index];
          if (!slot || slot.kind === "empty") return { typeId: null };
          return { typeId: slot.typeId };
        },
        queueChestMove: (from, to) => {
          if (this.state.openChestEntityId === null) return;
          this.gameClient.queueChestMove(
            this.state.openChestEntityId,
            from.source,
            from.index,
            to.source,
            to.index,
          );
        },
        markDirty: () => this.markDirty(),
      });
    }

    if (this.state.inventoryOpen && this.hotbarEditView) {
      return this.inventoryEditCoordinator.handlePointerInput({
        state: this.state,
        pointer,
        hotbarItems: this.getHotbarItems(),
        getSlotIndexAtPoint: (screenX, screenY) =>
          this.hotbarEditView?.getSlotIndexAtPoint(screenX, screenY) ?? null,
        queueInventoryMove: (fromSlotIndex, toSlotIndex) =>
          this.gameClient.queueInventoryMove(fromSlotIndex, toSlotIndex),
        markDirty: () => this.markDirty(),
      });
    }

    if (pointer.kind === "move" && this.craftModalView) {
      const consumed = this.craftingHudCoordinator.handlePointerMove({
        state: this.state,
        pointer,
        getCraftAtPoint: (screenX, screenY) =>
          this.craftModalView?.getCraftAtPoint(screenX, screenY) ?? null,
        getPreviewedCraftAtPoint: (screenX, screenY, previewedCraft) =>
          this.craftModalView?.getPreviewedCraftAtPoint(
            screenX,
            screenY,
            previewedCraft,
          ) ?? null,
      });
      if (consumed) {
        this.markDirty();
      }
      return consumed;
    }

    if (pointer.kind === "up") {
      return false;
    }

    if (this.state.craftingMenuOpen && this.craftModalView) {
      const consumed = this.craftingHudCoordinator.handleCraftModalPointerDown({
        state: this.state,
        screenX: pointer.screenX,
        screenY: pointer.screenY,
        canSubmitCraft: (itemTypeId) => this.canSubmitCraft(itemTypeId),
        queueCraftItem: (itemTypeId) =>
          this.gameClient.queueCraftItem(itemTypeId),
        isCraftButtonAtPoint: (screenX, screenY) =>
          this.craftModalView?.isCraftButtonAtPoint(screenX, screenY) ?? false,
        getCraftAtPoint: (screenX, screenY) =>
          this.craftModalView?.getCraftAtPoint(screenX, screenY) ?? null,
      });
      if (consumed) {
        this.markDirty();
      }
      return true;
    }

    const chestHandled = this.chestHudCoordinator.handleGameplayPointerDown({
      state: this.state,
      pointer,
      selectors: this.selectors,
      openChest: (chestEntityId) => {
        if (this.state.craftingMenuOpen) {
          this.craftingHudCoordinator.close(this.state);
        }
        if (this.state.inventoryOpen) {
          this.inventoryEditCoordinator.close(this.state);
        }
        this.chestHudCoordinator.open(this.state, chestEntityId);
        this.syncOverlaySuppression();
        this.markDirty();
      },
      queueBuildPlacement: (x, y) => this.gameClient.queueBuildPlacement(x, y),
    });
    if (chestHandled) {
      return true;
    }

    return this.craftingHudCoordinator.handleGameplayPointerDown({
      state: this.state,
      pointer,
      selectors: this.selectors,
      openCraftingMenu: () => {
        this.craftingHudCoordinator.open(this.state);
        this.syncOverlaySuppression();
        this.markDirty();
      },
      queueBuildPlacement: (x, y) => this.gameClient.queueBuildPlacement(x, y),
    });
  }

  public reset(): void {
    this.craftingHudCoordinator.reset(this.state);
    this.inventoryEditCoordinator.reset(this.state);
    this.chestHudCoordinator.reset(this.state);
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppression("crafting", false);
    this.gameClient.setMovementSuppression("inventory", false);
    this.gameClient.setMovementSuppression("chest", false);
    this.markDirty();
  }

  public isCraftingMenuOpen(): boolean {
    return this.state.craftingMenuOpen;
  }

  public isInventoryOpen(): boolean {
    return this.state.inventoryOpen;
  }

  public isChestOpen(): boolean {
    return this.state.chestOpen;
  }

  public closeChest(): void {
    if (!this.state.chestOpen) {
      return;
    }
    this.chestHudCoordinator.close(this.state);
    this.syncOverlaySuppression();
    this.markDirty();
  }

  public openChest(chestEntityId: number): void {
    if (this.state.craftingMenuOpen) {
      this.craftingHudCoordinator.close(this.state);
    }
    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
    }
    this.chestHudCoordinator.open(this.state, chestEntityId);
    this.syncOverlaySuppression();
    this.markDirty();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.root) {
      this.root.visible = visible;
    }
    this.markDirty();
  }

  public render(app: PIXI.Application, force = false): void {
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

    const craftProximity = this.craftingHudCoordinator.syncProximity(
      this.state,
      this.selectors,
    );
    if (craftProximity.changed) {
      this.syncOverlaySuppression();
      this.markDirty();
    }

    const chestProximity = this.chestHudCoordinator.syncProximity(
      this.state,
      this.selectors,
    );
    if (chestProximity.changed) {
      this.syncOverlaySuppression();
      this.markDirty();
    }

    const inventory = this.selectors.getInventory();
    const hotbarItems = this.getHotbarItems();
    this.inventoryEditCoordinator.sanitizeState(this.state, hotbarItems);
    this.gameplayHudCoordinator.syncResourceState(inventory);

    const nowMs = performance.now();
    const hotbarActiveIndex = computeHotbarActiveIndex({
      inventory,
      pendingHotbarIndex: undefined,
    });
    const toastChanged = this.gameplayHudCoordinator.updateSelectionToast({
      inventory,
      hotbarActiveIndex,
      nowMs,
    });
    if (toastChanged) {
      this.dirty = true;
    }
    const selectionToastVisible =
      this.gameplayHudCoordinator.isSelectionToastVisible(nowMs);

    const nearestPickup = getNearestPickup(
      this.selectors.getPlayerEntity(),
      this.selectors.getPickups(),
    );
    const nearPickup = nearestPickup !== null;

    const nearestChest = findNearestChest(
      this.selectors.getPlayerEntity(),
      this.selectors.getChests(),
    );
    const nearChest = nearestChest !== null && !this.state.chestOpen;

    const nearCraftingStation =
      !nearPickup &&
      !nearChest &&
      !this.state.craftingMenuOpen &&
      hasNearbyCraftingStation(
        this.selectors.getPlayerEntity(),
        this.selectors.getCraftingStations(),
      );

    const recyclerActive =
      !nearPickup &&
      !nearChest &&
      !nearCraftingStation &&
      (this.recyclerHoldStartMs !== null ||
        isNearRecyclerWithItem(
          this.selectors.getPlayerEntity(),
          this.selectors.getRecyclers(),
          inventory,
        ));

    const bossAlive =
      this.selectors.getWorldEntities().some((e) => e.typeId === "enemy:thanos" && e.alive);

    const repairActive =
      this.repairHoldStartMs !== null ||
      this.selectors.getNearDamagedTower() !== null;

    if (
      !this.dirty &&
      !force &&
      !sizeChanged &&
      !selectionToastVisible &&
      !recyclerActive &&
      !repairActive &&
      !bossAlive
    ) {
      return;
    }

    this.lastLayoutWidth = app.screen.width;
    this.lastLayoutHeight = app.screen.height;
    this.dirty = false;

    this.syncHotbarEditView(app.screen.width, app.screen.height, hotbarItems);
    this.syncChestView(app.screen.width, app.screen.height);
    const craftEntries = this.syncCraftModal(
      app.screen.width,
      app.screen.height,
    );

    if (
      this.statusPanel &&
      this.effectDetailPanel &&
      this.effectIconView &&
      this.combatHudView &&
      this.hotbarView &&
      this.resourceStackView
    ) {
      this.gameplayHudCoordinator.syncPanels({
        statusPanel: this.statusPanel,
        effectDetailPanel: this.effectDetailPanel,
        effectIconView: this.effectIconView,
        combatHudView: this.combatHudView,
        hotbarView: this.hotbarView,
        resourceStackView: this.resourceStackView,
        playerEntity: this.selectors.getPlayerEntity(),
        worldEntities: this.selectors.getWorldEntities(),
        trackedBuildings: this.selectors.getTrackedBuildings(),
        latestTick: this.gameClient.worldState?.latestTick ?? 0,
        performanceRates: this.gameClient.getMeasuredRates(),
        tickRate: this.gameClient.gameConfig.tickRate,
        inventoryOpen: this.state.inventoryOpen,
        inventory,
        hotbarActiveIndex,
        hotbarItems,
      });
    }

    if (this.dayNightIndicator) {
      this.gameplayHudCoordinator.syncDayNight({
        dayNightIndicator: this.dayNightIndicator,
        dayNight: this.selectors.getDayNight(),
        latestSnapshotReceivedAt:
          this.gameClient.worldState?.latestSnapshotReceivedAt,
      });
    }

    if (
      this.statusPanel &&
      this.effectIconView &&
      this.resourceStackView &&
      this.hotbarView &&
      this.combatHudView &&
      this.selectedItemToastView &&
      this.dayNightIndicator &&
      this.effectDetailPanel
    ) {
      this.gameplayHudCoordinator.layout({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        statusPanel: this.statusPanel,
        effectIconView: this.effectIconView,
        resourceStackView: this.resourceStackView,
        hotbarView: this.hotbarView,
        combatHudView: this.combatHudView,
        selectedItemToastView: this.selectedItemToastView,
        dayNightIndicator: this.dayNightIndicator,
        effectDetailPanel: this.effectDetailPanel,
        inventoryOpen: this.state.inventoryOpen,
        inventoryPanelRect: this.hotbarEditView?.getPanelRect() ?? null,
      });
    }

    if (this.selectedItemToastView) {
      this.gameplayHudCoordinator.syncSelectionToast({
        selectedItemToastView: this.selectedItemToastView,
        nowMs,
      });
    }

    this.syncBossHealthBar(app.screen.width, app.screen.height);
    this.syncTooltip(app.screen.width, app.screen.height, craftEntries);
    this.syncRecyclerPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      inventory,
      nearPickup,
      nearChest,
      nearCraftingStation,
    );
    this.syncRepairPrompt(app.screen.width, app.screen.height, nowMs);
    this.syncItemPickupPrompt(
      app.screen.width,
      app.screen.height,
      recyclerActive,
    );
    this.syncChestPrompt(app.screen.width, app.screen.height, nearPickup, nearChest);
    this.syncCraftingStationPrompt(app.screen.width, app.screen.height, nearCraftingStation);
    this.syncHunkBadge(inventory);
  }

  public markDirty(): void {
    this.dirty = true;
  }

  private syncOverlaySuppression(): void {
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppression(
      "crafting",
      this.state.craftingMenuOpen,
    );
    this.gameClient.setMovementSuppression(
      "inventory",
      this.state.inventoryOpen,
    );
    this.gameClient.setMovementSuppression("chest", this.state.chestOpen);
  }

  private syncTooltip(
    screenWidth: number,
    screenHeight: number,
    craftEntries: CraftingModalEntry[],
  ): void {
    if (!this.tooltipView) {
      return;
    }

    const tooltipState = this.tooltipCoordinator.resolveTooltipState({
      inventoryOpen: this.state.inventoryOpen,
      hoveredInventorySlotIndex: this.state.hoveredInventorySlotIndex,
      inventory: this.selectors.getInventory(),
      getInventorySlotRect: (slotIndex) =>
        this.hotbarEditView?.getSlotRect(slotIndex) ?? null,
      craftingMenuOpen: this.state.craftingMenuOpen,
      hoveredCraftItemTypeId:
        this.craftingHudCoordinator.getHoveredCraftItemTypeId(),
      hoveredCraftPreview: this.craftingHudCoordinator.isHoveredCraftPreview(),
      craftEntries,
      getCraftRect: (typeId) =>
        this.craftModalView?.getCraftRect(typeId) ?? null,
      getCraftPreviewRect: () => this.craftModalView?.getPreviewRect() ?? null,
    });

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

  private syncRecyclerPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    inventory: InventorySnapshot | undefined,
    nearPickup: boolean,
    nearChest: boolean,
    nearCraftingStation: boolean,
  ): void {
    if (!this.recyclerPromptView) {
      return;
    }

    const player = this.selectors.getPlayerEntity();
    const recyclers = this.selectors.getRecyclers();
    const near =
      !nearPickup &&
      !nearChest &&
      !nearCraftingStation &&
      isNearRecyclerWithItem(player, recyclers, inventory);

    let itemLabel = "";
    if (near && inventory) {
      const slot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
      if (slot && slot.kind !== "empty") {
        itemLabel = this.selectors.formatTypeLabel(slot.typeId);
      }
    }

    this.recyclerPromptView.sync({
      visible: near,
      itemLabel,
      holdStartMs: this.recyclerHoldStartMs,
      nowMs,
      screenWidth,
      screenHeight,
    });
  }

  private syncRepairPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
  ): void {
    if (!this.towerRepairPromptView) {
      return;
    }

    const tower = this.selectors.getNearDamagedTower();
    if (!tower) {
      this.towerRepairPromptView.sync({
        visible: false,
        towerLabel: "",
        repairCost: 0,
        holdStartMs: null,
        nowMs,
        screenWidth,
        screenHeight,
      });
      return;
    }

    const towerLabel = this.selectors.formatTypeLabel(tower.typeId);
    const repairCost = getTowerRepairCost(tower);

    this.towerRepairPromptView.sync({
      visible: true,
      towerLabel,
      repairCost,
      holdStartMs: this.repairHoldStartMs,
      nowMs,
      screenWidth,
      screenHeight,
    });
  }

  private syncItemPickupPrompt(
    screenWidth: number,
    screenHeight: number,
    recyclerActive: boolean,
  ): void {
    if (!this.itemPickupPromptView) {
      return;
    }

    if (recyclerActive) {
      this.itemPickupPromptView.sync({
        visible: false,
        itemLabel: "",
        screenWidth,
        screenHeight,
      });
      return;
    }

    const player = this.selectors.getPlayerEntity();
    const pickups = this.selectors.getPickups();
    const nearest = getNearestPickup(player, pickups);

    const itemLabel = nearest
      ? getPickupItemLabel(nearest, (id) => this.selectors.formatTypeLabel(id))
      : "";

    this.itemPickupPromptView.sync({
      visible: nearest !== null,
      itemLabel,
      screenWidth,
      screenHeight,
    });
  }

  private syncChestPrompt(
    screenWidth: number,
    screenHeight: number,
    nearPickup: boolean,
    nearChest: boolean,
  ): void {
    if (!this.chestPromptView) {
      return;
    }
    this.chestPromptView.sync({
      visible: nearChest && !nearPickup,
      screenWidth,
      screenHeight,
    });
  }

  private syncCraftingStationPrompt(
    screenWidth: number,
    screenHeight: number,
    nearCraftingStation: boolean,
  ): void {
    if (!this.craftingStationPromptView) {
      return;
    }
    this.craftingStationPromptView.sync({
      visible: nearCraftingStation,
      screenWidth,
      screenHeight,
    });
  }

  private syncBossHealthBar(screenWidth: number, screenHeight: number): void {
    if (!this.bossHealthBar) return;
    const boss = this.selectors
      .getWorldEntities()
      .find((e) => e.typeId === "enemy:thanos" && e.alive);
    this.bossHealthBar.sync({
      visible: boss !== undefined,
      hp: boss?.hp ?? 0,
      maxHp: boss?.maxHp ?? 2000,
      screenWidth,
      screenHeight,
    });
  }

  private syncHunkBadge(inventory: InventorySnapshot | undefined): void {
    if (
      !this.hunkBadge ||
      !this.hunkBadgeBg ||
      !this.hunkBadgeIcon ||
      !this.hunkBadgeText ||
      !this.hotbarView
    ) {
      return;
    }

    const hunkCount =
      inventory?.resources.find((r) => r.typeId === "item:hunk")?.amount ?? 0;
    const iconSize = 22;
    const padding = 8;
    const gap = 6;

    const hunkTexture = this.gameClient.renderer.getItemTexture(
      "item:hunk" as ResourceId,
    );
    this.hunkBadgeIcon.texture = hunkTexture;
    this.hunkBadgeIcon.width = iconSize;
    this.hunkBadgeIcon.height = iconSize;

    this.hunkBadgeText.text = String(hunkCount);

    const badgeWidth =
      padding + iconSize + gap + this.hunkBadgeText.width + padding;
    const badgeHeight = this.hotbarView.height;

    this.hunkBadgeBg.clear();
    this.hunkBadgeBg
      .roundRect(0, 0, badgeWidth, badgeHeight, 6)
      .fill({ color: 0x151515, alpha: 0.78 })
      .roundRect(0, 0, badgeWidth, badgeHeight, 6)
      .stroke({ width: 2, color: 0x4b4b4b, alpha: 0.7 });

    this.hunkBadgeIcon.position.set(padding, badgeHeight / 2);
    this.hunkBadgeText.position.set(padding + iconSize + gap, badgeHeight / 2);

    const hotbarX = this.hotbarView.container.x;
    const hotbarY = this.hotbarView.container.y;
    this.hunkBadge.position.set(hotbarX + this.hotbarView.width + 10, hotbarY);
  }

  private syncHotbarEditView(
    screenWidth: number,
    screenHeight: number,
    hotbarItems: ReturnType<typeof this.getHotbarItems>,
  ): void {
    if (!this.hotbarEditView) {
      return;
    }

    const inventory = this.selectors.getInventory();
    this.hotbarEditView.sync({
      visible: this.state.inventoryOpen,
      screenWidth,
      screenHeight,
      hotbarItems,
      selectedHotbarIndex: inventory?.selectedHotbarIndex ?? 0,
      hoveredSlotIndex: this.state.hoveredInventorySlotIndex,
      heldSlotIndex: this.state.heldInventorySlotIndex,
    });
  }

  private syncChestView(screenWidth: number, screenHeight: number): void {
    if (!this.chestView) {
      return;
    }
    const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
      this.state,
      this.selectors,
    );
    const inventory = this.selectors.getInventory();
    this.chestView.sync({
      visible: this.state.chestOpen,
      screenWidth,
      screenHeight,
      chestSlots: chestSlots ?? [],
      hotbarSlots: inventory?.hotbarSlots ?? emptyHotbarSlots(),
      hoveredRef: this.state.hoveredChestSlotRef,
      heldRef: this.state.heldChestSlotRef,
    });
  }

  private syncCraftModal(
    screenWidth: number,
    screenHeight: number,
  ): CraftingModalEntry[] {
    if (!this.craftModalView) {
      return [];
    }

    const visibleCraftableTypeIds = this.getVisibleCraftableTypeIds();
    this.syncCraftSelection(visibleCraftableTypeIds);

    const craftEntries = this.craftingHudCoordinator.buildCraftEntries({
      craftableTypeIds: visibleCraftableTypeIds,
      formatTypeLabel: (typeId) => this.selectors.formatTypeLabel(typeId),
      formatCosts: (costs) => this.selectors.formatCosts(costs),
      hasRecipeResources: (itemTypeId) =>
        this.selectors.hasRecipeResources(this.getRecipeForItem(itemTypeId)),
      getRecipeForItem: (itemTypeId) => this.getRecipeForItem(itemTypeId),
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

    return craftEntries;
  }

  private hasNearbyCraftingStation(): boolean {
    return this.craftingHudCoordinator.hasNearbyCraftingStation(this.selectors);
  }

  private canSubmitCraft(itemTypeId: ResourceId): boolean {
    if (!this.getVisibleCraftableTypeIds().includes(itemTypeId)) {
      return false;
    }

    if (!this.hasNearbyCraftingStation()) {
      return false;
    }

    return this.selectors.hasRecipeResources(this.getRecipeForItem(itemTypeId));
  }

  private describeCraftAvailability(itemTypeId: ResourceId): {
    enabled: boolean;
    statusLabel: string;
  } {
    if (!this.getVisibleCraftableTypeIds().includes(itemTypeId)) {
      return {
        enabled: false,
        statusLabel: "Blueprint required",
      };
    }

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

  private getVisibleCraftableTypeIds(): readonly ResourceId[] {
    const unlockedRecipeTypeIds = new Set(
      this.selectors.getInventory()?.unlockedRecipeTypeIds ?? [],
    );

    return CRAFTABLE_ITEM_TYPE_IDS.filter((itemTypeId) => {
      if (!isRecipeBlueprintLocked(itemTypeId)) {
        return true;
      }
      return unlockedRecipeTypeIds.has(itemTypeId);
    });
  }

  private syncCraftSelection(craftableTypeIds: readonly ResourceId[]): void {
    const firstCraftTypeId = craftableTypeIds[0];
    if (!firstCraftTypeId) {
      return;
    }

    if (!craftableTypeIds.includes(this.state.selectedCraft)) {
      this.state.selectedCraft = firstCraftTypeId;
    }
    if (!craftableTypeIds.includes(this.state.previewedCraft)) {
      this.state.previewedCraft = this.state.selectedCraft;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyHotbarSlots(): InventorySnapshot["hotbarSlots"] {
  return Array.from({ length: HOTBAR_SLOT_COUNT }, () => ({ kind: "empty" }));
}

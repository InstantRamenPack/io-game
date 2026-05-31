import * as PIXI from "pixi.js";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type {
  GameClientHudApi,
  PointerInput,
} from "@client/client/clientTypes.ts";
import {
  type CraftingModalEntry,
  type CraftingModalTab,
} from "@client/render/hud/CraftingModal.ts";
import { CombatHudView } from "@client/render/hud/CombatHudView.ts";
import { CraftingHudCoordinator } from "@client/render/hud/CraftingHudCoordinator.ts";
import { HubModalView } from "@client/render/hud/HubModalView.ts";
import { ChestHudCoordinator } from "@client/render/hud/ChestHudCoordinator.ts";
import type { ChestSlotRef } from "@client/render/hud/ChestView.ts";
import { BossHealthBar } from "@client/render/hud/BossHealthBar.ts";
import { DayNightIndicator } from "@client/render/hud/DayNightIndicator.ts";
import { EffectIconView } from "@client/render/hud/EffectIconView.ts";
import { GameplayHudCoordinator } from "@client/render/hud/GameplayHudCoordinator.ts";
import { HudPanel } from "@client/render/hud/HudPanel.ts";
import { HudTooltipCoordinator } from "@client/render/hud/HudTooltipCoordinator.ts";
import { HudTooltipView } from "@client/render/hud/HudTooltipView.ts";
import { HotbarView } from "@client/render/hud/HotbarView.ts";
import type {
  CraftingTabId,
  HudInteractionState,
} from "@client/render/hud/HudInteractionState.ts";
import { InventoryEditCoordinator } from "@client/render/hud/InventoryEditCoordinator.ts";
import { InventoryView } from "@client/render/hud/InventoryView.ts";
import { HoldActionPromptView } from "@client/render/hud/HoldActionPromptView.ts";
import { SelectedItemToastView } from "@client/render/hud/SelectedItemToastView.ts";
import {
  computeHotbarActiveIndex,
  toHotbarSlotItems,
} from "@client/render/hud/hotbarModel.ts";
import {
  getNearestPickup,
  getPickupItemLabel,
} from "@client/render/hud/pickupInteraction.ts";
import { findNearestChest } from "@client/render/hud/chestInteraction.ts";
import { getTowerRepairCost } from "@client/render/hud/towerRepairInteraction.ts";
import type { TextStyleOptions } from "@client/render/renderTypes.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
  getItemRecycleHunkValue,
  isRecipeBlueprintLocked,
} from "@shared/content/catalog.ts";
import { HOTBAR_SLOT_COUNT } from "@shared/gameplay/constants.ts";
import { getArmorStats } from "@shared/gameplay/rules/armorRules.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";

const HOTBAR_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const CRAFTING_TABS: ReadonlyArray<{ id: CraftingTabId; label: string }> = [
  { id: "weapons", label: "Weapons" },
  { id: "armor", label: "Armor" },
  { id: "ammo", label: "Ammo" },
  { id: "healing", label: "Healing" },
  { id: "buildings", label: "Buildings" },
];

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
  private hubModalView?: HubModalView;
  private tooltipView?: HudTooltipView;
  private selectedItemToastView?: SelectedItemToastView;
  private dayNightIndicator?: DayNightIndicator;
  private towerRepairPromptView?: HoldActionPromptView;
  private itemPickupPromptView?: HoldActionPromptView;
  private chestPromptView?: HoldActionPromptView;
  private craftingStationPromptView?: HoldActionPromptView;
  private repairHoldStartMs: number | null = null;
  private useItemHoldStartMs: number | null = null;
  private useItemPromptView?: HoldActionPromptView;
  private dragGhostContainer?: PIXI.Container;
  private dragGhostIcon?: PIXI.Sprite;
  private dragGhostCount?: PIXI.Text;
  private lastPointerScreenX = 0;
  private lastPointerScreenY = 0;
  private bossHealthBar?: BossHealthBar;
  private hunkBadge?: PIXI.Container;
  private hunkBadgeBg?: PIXI.Graphics;
  private hunkBadgeIcon?: PIXI.Sprite;
  private hunkBadgeText?: PIXI.Text;
  private visible = false;
  private dirty = true;
  private recycleDropHovered = false;
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
      craftingTab: "weapons",
      inventoryOpen: false,
      chestOpen: false,
      sectorFeedOpen: false,
      openChestEntityId: null,
      selectedCraft: defaultCraftItemTypeId,
      previewedCraft: defaultCraftItemTypeId,
      hoveredInventorySlotRef: null,
      heldInventorySlotRef: null,
      hoveredChestSlotRef: null,
      heldChestSlotRef: null,
      recycleHotbarIndex: null,
      recycleChestIndex: null,
      heldCraftOutputTypeId: null,
    };
  }

  public getState(): Readonly<HudState> {
    return this.state;
  }

  public refreshUi(): void {
    this.markDirty();
  }

  public toggleCraftingMenu(): void {
    if (this.state.craftingMenuOpen || this.state.chestOpen) {
      this.closeHubTower();
      return;
    }

    const hub = findNearestChest(
      this.selectors.getPlayerEntity(),
      this.selectors.getChests(),
    );
    if (hub) {
      this.openHubTower(hub.id);
      return;
    }

    this.craftingHudCoordinator.open(this.state);
    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
    }
    this.markDirty();
  }

  public toggleInventory(): void {
    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
    } else {
      this.inventoryEditCoordinator.open(this.state);
      if (this.state.craftingMenuOpen) {
        this.craftingHudCoordinator.close(this.state);
      }
    }
    this.markDirty();
  }

  public toggleSectorFeed(): boolean {
    this.state.sectorFeedOpen = !this.state.sectorFeedOpen;
    this.markDirty();
    return this.state.sectorFeedOpen;
  }

  public selectHotbarItemByOrdinal(ordinal: number): boolean {
    const index = ordinal - 1;
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT) {
      return false;
    }
    this.gameClient.queueSelectHotbarIndex(index);
    return true;
  }

  public moveCraftSelection(delta: number): boolean {
    const changed = this.craftingHudCoordinator.moveSelection(
      this.state,
      delta,
      CRAFTABLE_ITEM_TYPE_IDS,
    );
    if (changed) {
      this.markDirty();
    }
    return changed;
  }

  public queueSelectedCraft(): void {
    if (!this.describeCraftAvailability(this.state.selectedCraft).enabled) {
      return;
    }
    this.gameClient.queueCraftItem(this.state.selectedCraft);
    this.markDirty();
  }

  public handleCraftListWheel(
    screenX: number,
    screenY: number,
    deltaY: number,
  ): boolean {
    if (!this.state.craftingMenuOpen || !this.hubModalView) {
      return false;
    }
    if (!this.hubModalView.containsPoint(screenX, screenY)) {
      return false;
    }
    if (deltaY === 0) {
      return false;
    }
    if (this.hubModalView.isCraftingTabsAtPoint(screenX, screenY)) {
      const changed = this.hubModalView.scrollCraftingTabsBy(deltaY);
      if (changed) {
        this.markDirty();
      }
      return changed;
    }
    const changed = this.hubModalView.scrollBy(deltaY / 240);
    if (changed) {
      this.markDirty();
    }
    return changed;
  }

  public handlePointerInput(pointer: PointerInput): boolean {
    this.lastPointerScreenX = pointer.screenX;
    this.lastPointerScreenY = pointer.screenY;
    if (!this.visible) {
      return false;
    }

    const inventory = this.selectors.getInventory();
    const hotbarItems = toHotbarSlotItems(inventory?.hotbarSlots ?? []);

    if (this.state.craftingMenuOpen && this.hubModalView) {
      if (pointer.kind === "up" && this.state.heldCraftOutputTypeId) {
        const craftTypeId = this.state.heldCraftOutputTypeId;
        const hotbarTarget = this.hubModalView?.getSlotRefAtPoint(
          pointer.screenX,
          pointer.screenY,
        );
        if (
          hotbarTarget &&
          this.describeCraftAvailability(craftTypeId).enabled
        ) {
          this.gameClient.queueCraftItem(
            craftTypeId,
            hotbarTarget.source === "chest"
              ? {
                  source: "chest",
                  index: hotbarTarget.index,
                  chestEntityId: this.state.openChestEntityId ?? undefined,
                }
              : { source: "hotbar", index: hotbarTarget.index },
          );
        }
        this.state.heldCraftOutputTypeId = null;
        this.markDirty();
        return true;
      }

      if (this.state.chestOpen && this.state.heldChestSlotRef !== null) {
        const overRecycle =
          this.hubModalView?.isRecycleDropAtPoint(
            pointer.screenX,
            pointer.screenY,
          ) ?? false;
        if (overRecycle !== this.recycleDropHovered) {
          this.recycleDropHovered = overRecycle;
          this.markDirty();
        }
      } else if (this.recycleDropHovered) {
        this.recycleDropHovered = false;
        this.markDirty();
      }

      const heldForRecycle = this.state.heldChestSlotRef;
      if (
        pointer.kind === "up" &&
        this.state.chestOpen &&
        heldForRecycle !== null &&
        (this.hubModalView?.isRecycleDropAtPoint(
          pointer.screenX,
          pointer.screenY,
        ) ??
          false)
      ) {
        this.tryRecycleHeldItem(heldForRecycle);
        this.recycleDropHovered = false;
        this.markDirty();
      }

      if (
        this.state.chestOpen &&
        this.hubModalView &&
        (this.state.heldChestSlotRef ||
          this.hubModalView.getSlotRefAtPoint(pointer.screenX, pointer.screenY))
      ) {
        return this.handleChestPointerInput(pointer, hotbarItems);
      }

      if (pointer.kind === "move") {
        return this.craftingHudCoordinator.handlePointerMove({
          state: this.state,
          pointer,
          getCraftAtPoint: (screenX, screenY) =>
            this.hubModalView?.getCraftAtPoint(screenX, screenY) ?? null,
          getPreviewedCraftAtPoint: (screenX, screenY, previewedCraft) =>
            this.hubModalView?.getPreviewedCraftAtPoint(
              screenX,
              screenY,
              previewedCraft,
            ) ?? null,
        });
      }
      if (pointer.kind === "down") {
        const handledCraftingPointer =
          this.craftingHudCoordinator.handleCraftModalPointerDown({
            state: this.state,
            screenX: pointer.screenX,
            screenY: pointer.screenY,
            shiftKey: pointer.shiftKey,
            canSubmitCraft: (itemTypeId) =>
              this.describeCraftAvailability(itemTypeId).enabled,
            queueCraftItem: (itemTypeId) =>
              this.gameClient.queueCraftItem(itemTypeId),
            isRecycleButtonAtPoint: (screenX, screenY) =>
              this.hubModalView?.isRecycleButtonAtPoint(screenX, screenY) ??
              false,
            isRecycleDropAtPoint: (screenX, screenY) =>
              this.hubModalView?.isRecycleDropAtPoint(screenX, screenY) ??
              false,
            canRecycleHotbarIndex: (index) => this.canRecycleHotbarIndex(index),
            queueRecycleHotbarIndex: (index) =>
              this.gameClient.queueRecycleHotbarIndex(index),
            queueRecycleChestIndex: (index) => {
              if (this.state.openChestEntityId === null) return;
              const inv = this.selectors.getInventory();
              if (!inv) return;
              const emptyIdx = inv.hotbarSlots.findIndex(
                (s) => s.kind === "empty",
              );
              if (emptyIdx < 0) return;
              this.gameClient.queueChestMove(
                this.state.openChestEntityId,
                "chest",
                index,
                "hotbar",
                emptyIdx,
              );
              this.gameClient.queueRecycleHotbarIndex(emptyIdx);
            },
            getSelectedHotbarIndex: () =>
              this.selectors.getInventory()?.selectedHotbarIndex ?? 0,
            getCraftAtPoint: (screenX, screenY) =>
              this.hubModalView?.getCraftAtPoint(screenX, screenY) ?? null,
            getTabAtPoint: (screenX, screenY) =>
              this.hubModalView?.getTabAtPoint(screenX, screenY) ?? null,
          });
        if (handledCraftingPointer) {
          this.markDirty();
          return true;
        }
        if (this.state.chestOpen && this.hubModalView) {
          return this.handleChestPointerInput(pointer, hotbarItems);
        }
        return this.hubModalView.containsPoint(
          pointer.screenX,
          pointer.screenY,
        );
      }
      return true;
    }

    if (this.state.chestOpen && this.hubModalView) {
      return this.handleChestPointerInput(pointer, hotbarItems);
    }

    if (this.state.inventoryOpen && this.hotbarEditView) {
      return this.inventoryEditCoordinator.handlePointerInput({
        state: this.state,
        pointer,
        hotbarItems,
        getSlotRefAtPoint: (screenX, screenY) =>
          this.hotbarEditView?.getSlotRefAtPoint(screenX, screenY) ?? null,
        queueInventoryMove: (from, to) =>
          this.gameClient.queueInventoryMove(from.index, to.index),
        markDirty: () => this.markDirty(),
      });
    }

    if (pointer.kind !== "down") {
      return false;
    }

    if (
      this.chestHudCoordinator.handleGameplayPointerDown({
        state: this.state,
        pointer,
        selectors: this.selectors,
        openChest: (chestEntityId) => this.openChest(chestEntityId),
        queueBuildPlacement: (x, y) =>
          this.gameClient.queueBuildPlacement(x, y),
      })
    ) {
      this.markDirty();
      return true;
    }

    if (
      this.craftingHudCoordinator.handleGameplayPointerDown({
        state: this.state,
        pointer,
        selectors: this.selectors,
        openCraftingMenu: () => this.toggleCraftingMenu(),
        queueBuildPlacement: (x, y) =>
          this.gameClient.queueBuildPlacement(x, y),
      })
    ) {
      this.markDirty();
      return true;
    }

    const activeIndex = computeHotbarActiveIndex({
      inventory,
      pendingHotbarIndex: undefined,
    });
    const activeSlot =
      activeIndex === null ? undefined : hotbarItems[activeIndex];
    if (activeSlot?.typeId && getItemContent(activeSlot.typeId)?.consumable) {
      this.gameClient.queueUseConsumable(activeSlot.typeId as ResourceId);
      return true;
    }

    return false;
  }

  private handleChestPointerInput(
    pointer: PointerInput,
    hotbarItems: ReturnType<typeof toHotbarSlotItems>,
  ): boolean {
    if (!this.hubModalView) {
      return false;
    }
    return this.chestHudCoordinator.handlePointerInput({
      state: this.state,
      pointer,
      getSlotRefAtPoint: (screenX, screenY) =>
        this.hubModalView?.getSlotRefAtPoint(screenX, screenY) ?? null,
      getSlotItem: (ref) => {
        if (ref.source === "hotbar") {
          return hotbarItems[ref.index] ?? null;
        }
        const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
          this.state,
          this.selectors,
        );
        const slot = chestSlots?.[ref.index];
        if (!slot || slot.kind === "empty") {
          return null;
        }
        return { typeId: slot.typeId };
      },
      queueChestMove: (from, to) => {
        if (this.state.openChestEntityId === null) {
          return;
        }
        this.gameClient.queueChestMove(
          this.state.openChestEntityId,
          from.source,
          from.index,
          to.source,
          to.index,
        );
      },
      findFirstEmptySlot: (source) => {
        if (source === "hotbar") {
          const inventory = this.selectors.getInventory();
          if (!inventory) return null;
          const index = inventory.hotbarSlots.findIndex(
            (slot) => slot.kind === "empty",
          );
          return index >= 0 ? index : null;
        }
        const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
          this.state,
          this.selectors,
        );
        if (!chestSlots) return null;
        const index = chestSlots.findIndex((slot) => slot.kind === "empty");
        return index >= 0 ? index : null;
      },
      markDirty: () => this.markDirty(),
    });
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
    this.closeHubTower();
  }

  public openChest(chestEntityId: number): void {
    this.openHubTower(chestEntityId);
  }

  public openHubTower(hubEntityId: number): void {
    this.chestHudCoordinator.open(this.state, hubEntityId);
    if (!this.state.craftingMenuOpen) {
      this.craftingHudCoordinator.open(this.state);
    }
    if (this.state.inventoryOpen) {
      this.inventoryEditCoordinator.close(this.state);
    }
    this.markDirty();
  }

  public closeHubTower(): void {
    const wasOpen = this.state.chestOpen || this.state.craftingMenuOpen;
    this.chestHudCoordinator.close(this.state);
    this.craftingHudCoordinator.close(this.state);
    this.recycleDropHovered = false;
    if (wasOpen) {
      this.markDirty();
    }
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    this.markDirty();
  }

  public setRepairHoldStartMs(ms: number | null): void {
    this.repairHoldStartMs = ms;
    this.markDirty();
  }

  public setUseItemHoldStartMs(ms: number | null): void {
    this.useItemHoldStartMs = ms;
    this.markDirty();
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
        ammoFilledTextureProvider: () =>
          PIXI.Texture.from("/hud/bullet-filled.png"),
        ammoEmptyTextureProvider: () =>
          PIXI.Texture.from("/hud/bullet-empty.png"),
        magTextureProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
        armorFilledTextureProvider: () =>
          PIXI.Texture.from("/hud/armor-filled.png"),
        armorEmptyTextureProvider: () =>
          PIXI.Texture.from("/hud/armor-empty.png"),
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
      this.hubModalView = new HubModalView({
        iconProvider: (typeId) =>
          this.gameClient.renderer.getItemTexture(typeId),
        craftingStyles: {
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
        },
      });
      this.tooltipView = new HudTooltipView();
      this.selectedItemToastView = new SelectedItemToastView();
      this.dayNightIndicator = new DayNightIndicator(this.dayNightLabelStyle);
      this.towerRepairPromptView = new HoldActionPromptView("Hold E to repair");
      this.useItemPromptView = new HoldActionPromptView("Hold E to use");
      this.itemPickupPromptView = new HoldActionPromptView(
        "Press E to pick up",
      );
      this.chestPromptView = new HoldActionPromptView(
        "Press E at the tower hub",
      );
      this.craftingStationPromptView = new HoldActionPromptView(
        "Press E at the tower hub",
      );
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
        this.hotbarEditView.container,
        this.hubModalView.container,
        this.dayNightIndicator.container,
        this.selectedItemToastView.container,
        this.towerRepairPromptView.container,
        this.useItemPromptView.container,
        this.itemPickupPromptView.container,
        this.chestPromptView.container,
        this.craftingStationPromptView.container,
        this.bossHealthBar.container,
        this.tooltipView.container,
      );
      this.dragGhostContainer = new PIXI.Container();
      this.dragGhostIcon = new PIXI.Sprite();
      this.dragGhostIcon.anchor.set(0.5);
      this.dragGhostCount = new PIXI.Text(
        "",
        new PIXI.TextStyle({
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: 12,
          fill: 0xf3f6ee,
          stroke: { color: 0x0c120b, width: 3 },
        }),
      );
      this.dragGhostCount.anchor.set(1, 1);
      this.dragGhostContainer.addChild(this.dragGhostIcon, this.dragGhostCount);
      this.dragGhostContainer.visible = false;
      this.root.addChild(this.dragGhostContainer);
    }

    if (this.root.parent !== parent) {
      parent.addChild(this.root);
    }

    this.root.visible = this.visible;
    this.markDirty();
  }

  public reset(): void {
    this.craftingHudCoordinator.reset(this.state);
    this.inventoryEditCoordinator.reset(this.state);
    this.chestHudCoordinator.reset(this.state);
    this.state.sectorFeedOpen = false;
    if (this.statusPanel) {
      this.statusPanel.container.visible = false;
    }
    this.gameClient.stopHoldFire();
    this.gameClient.setMovementSuppression("crafting", false);
    this.gameClient.setMovementSuppression("inventory", false);
    this.gameClient.setMovementSuppression("chest", false);
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

    const hubStillNearby =
      findNearestChest(
        this.selectors.getPlayerEntity(),
        this.selectors.getChests(),
      ) !== null;
    if (
      (this.state.craftingMenuOpen || this.state.chestOpen) &&
      !hubStillNearby
    ) {
      this.closeHubTower();
    }

    const inventory = this.selectors.getInventory();
    const hotbarItems = this.getHotbarItems();
    this.inventoryEditCoordinator.sanitizeState(this.state, hotbarItems);

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
    const nearChest =
      nearestChest !== null &&
      !this.state.chestOpen &&
      !this.state.craftingMenuOpen;

    const nearCraftingStation = false;

    const bossAlive = this.selectors
      .getWorldEntities()
      .some((e) => e.typeId === "enemy:thanos" && e.alive);

    const repairActive =
      this.repairHoldStartMs !== null ||
      this.selectors.getNearDamagedTower() !== null;

    const useItemActive =
      !nearPickup &&
      !nearChest &&
      !nearCraftingStation &&
      (this.useItemHoldStartMs !== null ||
        (() => {
          if (!inventory) return false;
          const slot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
          if (!slot || slot.kind !== "buildable") return false;
          const typeId = slot.typeId as ResourceId;
          return !!(
            getItemContent(typeId)?.consumable || getArmorStats(typeId)
          );
        })());

    if (
      !this.dirty &&
      !force &&
      !sizeChanged &&
      !selectionToastVisible &&
      !repairActive &&
      !useItemActive &&
      !bossAlive
    ) {
      return;
    }

    this.lastLayoutWidth = app.screen.width;
    this.lastLayoutHeight = app.screen.height;
    this.dirty = false;

    this.syncHotbarEditView(app.screen.width, app.screen.height, hotbarItems);
    const craftEntries = this.syncHubModal(app.screen.width, app.screen.height);

    if (
      this.statusPanel &&
      this.effectDetailPanel &&
      this.effectIconView &&
      this.combatHudView &&
      this.hotbarView
    ) {
      this.gameplayHudCoordinator.syncPanels({
        statusPanel: this.statusPanel,
        effectDetailPanel: this.effectDetailPanel,
        effectIconView: this.effectIconView,
        combatHudView: this.combatHudView,
        hotbarView: this.hotbarView,
        playerEntity: this.selectors.getPlayerEntity(),
        worldEntities: this.selectors.getWorldEntities(),
        trackedBuildings: this.selectors.getTrackedBuildings(),
        latestTick: this.gameClient.worldState?.latestTick ?? 0,
        infrastructure: this.selectors.getInfrastructure(),
        performanceRates: this.gameClient.getMeasuredRates(),
        tickRate: this.gameClient.gameConfig.tickRate,
        inventoryOpen: this.state.inventoryOpen,
        inventory,
        hotbarActiveIndex,
        hotbarItems,
      });
      this.statusPanel.container.visible = this.state.sectorFeedOpen;
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
    const actionPromptAnchorBottomY =
      this.combatHudView?.container.y !== undefined
        ? this.combatHudView.container.y - 10
        : app.screen.height - 140;
    this.syncRepairPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      actionPromptAnchorBottomY,
    );
    this.syncUseItemPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      inventory,
      useItemActive,
      actionPromptAnchorBottomY,
    );
    this.syncItemPickupPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      actionPromptAnchorBottomY,
    );
    this.syncChestPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      nearPickup,
      nearChest,
      actionPromptAnchorBottomY,
    );
    this.syncCraftingStationPrompt(
      app.screen.width,
      app.screen.height,
      nowMs,
      nearCraftingStation,
      actionPromptAnchorBottomY,
    );
    this.syncHunkBadge(inventory);
    this.syncDragGhost();
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
      hoveredInventorySlotIndex:
        this.state.hoveredInventorySlotRef?.source === "hotbar"
          ? this.state.hoveredInventorySlotRef.index
          : null,
      inventory: this.selectors.getInventory(),
      getInventorySlotRect: (slotIndex) =>
        this.hotbarEditView?.getSlotRect({
          source: "hotbar",
          index: slotIndex,
        }) ?? null,
      craftingMenuOpen: this.state.craftingMenuOpen,
      hoveredCraftItemTypeId:
        this.craftingHudCoordinator.getHoveredCraftItemTypeId(),
      hoveredCraftPreview: this.craftingHudCoordinator.isHoveredCraftPreview(),
      craftEntries,
      getCraftRect: (typeId) => this.hubModalView?.getCraftRect(typeId) ?? null,
      getCraftPreviewRect: () => this.hubModalView?.getPreviewRect() ?? null,
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

  private syncRepairPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    anchorBottomY: number,
  ): void {
    if (!this.towerRepairPromptView) {
      return;
    }

    const tower = this.selectors.getNearDamagedTower();
    if (!tower) {
      this.towerRepairPromptView.sync({
        visible: false,
        text: "",
        holdStartMs: null,
        nowMs,
        screenWidth,
        screenHeight,
        anchorBottomY,
        canProgress: false,
      });
      return;
    }

    const towerLabel = this.selectors.formatTypeLabel(tower.typeId);
    const repairCost = getTowerRepairCost(tower);
    const canAfford =
      this.selectors.countInventoryType("item:hunk") >= repairCost;

    this.towerRepairPromptView.sync({
      visible: true,
      text: `Hold E to repair ${towerLabel} (${repairCost} hunk)`,
      holdStartMs: this.repairHoldStartMs,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
      canProgress: canAfford,
    });
  }

  private syncUseItemPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    inventory: InventorySnapshot | undefined,
    visible: boolean,
    anchorBottomY: number,
  ): void {
    if (!this.useItemPromptView) {
      return;
    }
    if (!visible || !inventory) {
      this.useItemPromptView.sync({
        visible: false,
        text: "",
        holdStartMs: null,
        nowMs,
        screenWidth,
        screenHeight,
        anchorBottomY,
      });
      return;
    }
    const slot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
    if (!slot || slot.kind === "empty") {
      this.useItemPromptView.sync({
        visible: false,
        text: "",
        holdStartMs: null,
        nowMs,
        screenWidth,
        screenHeight,
        anchorBottomY,
      });
      return;
    }
    const typeId = slot.typeId as ResourceId;
    const verb = getArmorStats(typeId) ? "equip" : "use";
    const itemLabel = this.selectors.formatTypeLabel(typeId);
    this.useItemPromptView.sync({
      visible: true,
      text: `Hold E to ${verb} ${itemLabel}`,
      holdStartMs: this.useItemHoldStartMs,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
    });
  }

  private syncItemPickupPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    anchorBottomY: number,
  ): void {
    if (!this.itemPickupPromptView) {
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
      text: `Press E to pick up ${itemLabel}`.trim(),
      holdStartMs: null,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
    });
  }

  private syncChestPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    nearPickup: boolean,
    nearChest: boolean,
    anchorBottomY: number,
  ): void {
    if (!this.chestPromptView) {
      return;
    }
    this.chestPromptView.sync({
      visible: nearChest && !nearPickup,
      text: "Press E at the tower hub",
      holdStartMs: null,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
    });
  }

  private syncCraftingStationPrompt(
    screenWidth: number,
    screenHeight: number,
    nowMs: number,
    nearCraftingStation: boolean,
    anchorBottomY: number,
  ): void {
    if (!this.craftingStationPromptView) {
      return;
    }
    this.craftingStationPromptView.sync({
      visible: nearCraftingStation,
      text: "Press E at the tower hub",
      holdStartMs: null,
      nowMs,
      screenWidth,
      screenHeight,
      anchorBottomY,
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

    this.hunkBadgeIcon.texture = this.gameClient.renderer.getItemTexture(
      "item:hunk" as ResourceId,
    );
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
      hoveredSlotRef: this.state.hoveredInventorySlotRef,
      heldSlotRef: this.state.heldInventorySlotRef,
    });
  }

  private syncDragGhost(): void {
    if (
      !this.dragGhostContainer ||
      !this.dragGhostIcon ||
      !this.dragGhostCount
    ) {
      return;
    }
    const item = this.getHeldDragItem();
    if (!item?.typeId) {
      this.dragGhostContainer.visible = false;
      return;
    }
    this.dragGhostContainer.visible = true;
    this.dragGhostIcon.texture = this.gameClient.renderer.getItemTexture(
      item.typeId,
    );
    this.dragGhostIcon.width = 34;
    this.dragGhostIcon.height = 34;
    this.dragGhostContainer.position.set(
      this.lastPointerScreenX + 12,
      this.lastPointerScreenY + 12,
    );
    if (item.count !== null && item.count > 1) {
      this.dragGhostCount.text = String(item.count);
      this.dragGhostCount.visible = true;
      this.dragGhostCount.position.set(20, 20);
    } else {
      this.dragGhostCount.visible = false;
      this.dragGhostCount.text = "";
    }
    this.dragGhostContainer.zIndex = 99999;
  }

  private getHeldDragItem() {
    const hotbarItems = this.getHotbarItems();
    if (this.state.inventoryOpen && this.state.heldInventorySlotRef) {
      return hotbarItems[this.state.heldInventorySlotRef.index] ?? null;
    }
    if (this.state.heldCraftOutputTypeId) {
      return {
        typeId: this.state.heldCraftOutputTypeId,
        count: 1,
        showCountWhenOne: false,
        ammoInMag: null,
        magSize: null,
        reserveMagCount: null,
        reloadTicksRemaining: null,
      };
    }
    if (this.state.chestOpen && this.state.heldChestSlotRef) {
      if (this.state.heldChestSlotRef.source === "hotbar") {
        return hotbarItems[this.state.heldChestSlotRef.index] ?? null;
      }
      const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
        this.state,
        this.selectors,
      );
      if (!chestSlots) return null;
      const chestItems = toHotbarSlotItems(chestSlots);
      return chestItems[this.state.heldChestSlotRef.index] ?? null;
    }
    return null;
  }

  private syncHubModal(
    screenWidth: number,
    screenHeight: number,
  ): CraftingModalEntry[] {
    if (!this.hubModalView) {
      return [];
    }

    const allVisibleCraftableTypeIds = this.getVisibleCraftableTypeIds();
    const craftTabs = this.buildCraftingTabs(allVisibleCraftableTypeIds);
    if (
      !craftTabs.some(
        (tab) => tab.id === this.state.craftingTab && tab.count > 0,
      )
    ) {
      this.state.craftingTab =
        craftTabs.find((tab) => tab.count > 0)?.id ?? "weapons";
    }
    const visibleCraftableTypeIds = allVisibleCraftableTypeIds.filter(
      (typeId) => this.getCraftingTabForItem(typeId) === this.state.craftingTab,
    );
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

    const inventory = this.selectors.getInventory();
    const recycleHotbarIndex = this.state.recycleHotbarIndex;
    const recycleChestIndex = this.state.recycleChestIndex;
    const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
      this.state,
      this.selectors,
    );

    let recycleItemLabel = "";
    if (recycleHotbarIndex !== null) {
      const slot = inventory?.hotbarSlots[recycleHotbarIndex];
      if (slot && slot.kind !== "empty") {
        recycleItemLabel = this.selectors.formatTypeLabel(slot.typeId);
      }
    } else if (recycleChestIndex !== null) {
      const slot = chestSlots?.[recycleChestIndex];
      if (slot && slot.kind !== "empty") {
        recycleItemLabel = this.selectors.formatTypeLabel(slot.typeId);
      }
    }

    const recycleEnabled =
      ((recycleHotbarIndex !== null &&
        this.canRecycleHotbarIndex(recycleHotbarIndex)) ||
        (recycleChestIndex !== null &&
          (() => {
            const slot = chestSlots?.[recycleChestIndex];
            return (
              slot != null &&
              slot.kind !== "empty" &&
              this.canRecycleTypeId(slot.typeId)
            );
          })())) &&
      this.hasNearbyCraftingStation();

    this.hubModalView.sync({
      screenWidth,
      screenHeight,
      craftingVisible: this.state.craftingMenuOpen,
      storageVisible: this.state.chestOpen,
      craftEntries,
      tabs: craftTabs,
      activeTab: this.state.craftingTab,
      selectedCraft: this.state.selectedCraft,
      previewedCraft: this.state.previewedCraft,
      iconProvider: (typeId) => this.gameClient.renderer.getItemTexture(typeId),
      craftButtonEnabled: craftAvailability.enabled,
      previewStatusLabel: craftAvailability.statusLabel,
      recycleHotbarIndex,
      recycleChestIndex,
      recycleItemLabel,
      recycleEnabled,
      recycleDropHovered: this.recycleDropHovered,
      recycleIconProvider: (index) => {
        const slot = inventory?.hotbarSlots[index];
        if (!slot || slot.kind === "empty") return null;
        return this.gameClient.renderer.getItemTexture(slot.typeId);
      },
      recycleChestIconProvider: (index) => {
        const slot = chestSlots?.[index];
        if (!slot || slot.kind === "empty") return null;
        return this.gameClient.renderer.getItemTexture(slot.typeId);
      },
      chestSlots: chestSlots ?? [],
      hotbarSlots: inventory?.hotbarSlots ?? emptyHotbarSlots(),
      hoveredChestRef: this.state.hoveredChestSlotRef,
      heldChestRef: this.state.heldChestSlotRef,
    });

    return craftEntries;
  }

  private hasNearbyCraftingStation(): boolean {
    return this.craftingHudCoordinator.hasNearbyCraftingStation(this.selectors);
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
        statusLabel: "Move closer to the tower hub",
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

  private canRecycleHotbarIndex(index: number): boolean {
    const inventory = this.selectors.getInventory();
    const slot = inventory?.hotbarSlots[index];
    if (!slot || slot.kind === "empty") {
      return false;
    }
    const typeId = slot.typeId;
    const recycleValue = getItemRecycleHunkValue(typeId);
    if (recycleValue !== undefined) {
      return recycleValue > 0;
    }
    return !(slot.kind === "weapon" && getItemContent(typeId)?.hidden);
  }

  private canRecycleTypeId(typeId: string): boolean {
    const recycleValue = getItemRecycleHunkValue(typeId as ResourceId);
    if (recycleValue !== undefined) {
      return recycleValue > 0;
    }
    return !getItemContent(typeId as ResourceId)?.hidden;
  }

  private tryRecycleHeldItem(ref: ChestSlotRef): void {
    if (ref.source === "hotbar") {
      if (this.canRecycleHotbarIndex(ref.index)) {
        this.state.recycleHotbarIndex = ref.index;
        this.state.recycleChestIndex = null;
      }
      return;
    }
    const chestSlots = this.chestHudCoordinator.getOpenChestSlots(
      this.state,
      this.selectors,
    );
    const chestSlot = chestSlots?.[ref.index];
    if (!chestSlot || chestSlot.kind === "empty") {
      return;
    }
    if (!this.canRecycleTypeId(chestSlot.typeId)) {
      return;
    }
    this.state.recycleChestIndex = ref.index;
    this.state.recycleHotbarIndex = null;
  }

  private getVisibleCraftableTypeIds(): readonly ResourceId[] {
    const unlockedRecipeTypeIds = new Set(
      this.selectors.getInventory()?.unlockedRecipeTypeIds ?? [],
    );

    return CRAFTABLE_ITEM_TYPE_IDS.filter((itemTypeId) => {
      if (this.isMagRecipeLocked(itemTypeId, unlockedRecipeTypeIds)) {
        return false;
      }
      if (!isRecipeBlueprintLocked(itemTypeId)) {
        return true;
      }
      return unlockedRecipeTypeIds.has(itemTypeId);
    });
  }

  private isMagRecipeLocked(
    itemTypeId: ResourceId,
    unlockedRecipeTypeIds: ReadonlySet<ResourceId>,
  ): boolean {
    return (
      this.getCraftingTabForItem(itemTypeId) === "ammo" &&
      !unlockedRecipeTypeIds.has(itemTypeId)
    );
  }

  private buildCraftingTabs(
    craftableTypeIds: readonly ResourceId[],
  ): CraftingModalTab[] {
    return CRAFTING_TABS.map((tab) => ({
      ...tab,
      count: craftableTypeIds.filter(
        (typeId) => this.getCraftingTabForItem(typeId) === tab.id,
      ).length,
    }));
  }

  private getCraftingTabForItem(itemTypeId: ResourceId): CraftingTabId {
    const item = getItemContent(itemTypeId);
    if (this.isMagazineItemTypeId(itemTypeId)) {
      return "ammo";
    }
    if (item?.weapon) {
      return "weapons";
    }
    if (item?.armor) {
      return "armor";
    }
    if (item?.healing || item?.activeEffect || item?.consumable) {
      return "healing";
    }
    return "buildings";
  }

  private isMagazineItemTypeId(itemTypeId: ResourceId): boolean {
    return itemTypeId.startsWith("mag:");
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

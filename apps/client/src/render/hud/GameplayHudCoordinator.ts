import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { DayNightIndicator } from "@client/render/hud/DayNightIndicator.ts";
import type { EffectIconView } from "@client/render/hud/EffectIconView.ts";
import type { HudPanel } from "@client/render/hud/HudPanel.ts";
import type {
  HotbarView,
  HotbarSlotItem,
} from "@client/render/hud/HotbarView.ts";
import type { ResourceStackView } from "@client/render/hud/ResourceStackView.ts";
import type { SelectedItemToastView } from "@client/render/hud/SelectedItemToastView.ts";
import { buildStatusPanelContent } from "@client/render/hud/hudPanelModels.ts";
import {
  buildActiveEffectEntries,
  buildCombatHudModel,
  buildSelectedItemLabel,
} from "@client/render/hud/hudPresentationModels.ts";
import type { CombatHudView } from "@client/render/hud/CombatHudView.ts";
import {
  buildResourceStackEntries,
  syncDiscoveredResources,
} from "@client/render/hud/resourceStackModel.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  DayNightSnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";

type ScreenRect = { x: number; y: number; width: number; height: number };

type PerformanceRates = {
  tickRate: number | null;
  frameRate: number | null;
};

export class GameplayHudCoordinator {
  private readonly discoveredResourceTypeIds: ResourceId[] = [];
  private readonly resourceCounts = new Map<ResourceId, number>();
  private readonly selectionToastDurationMs = 1600;
  private selectedItemToastLabel: string | null = null;
  private selectedItemToastShownAtMs = 0;
  private hasSeenInitialHotbarSelection = false;
  private lastHotbarActiveIndex: number | null = null;

  public updateSelectionToast(options: {
    inventory: InventorySnapshot | undefined;
    hotbarActiveIndex: number | null;
    nowMs: number;
  }): boolean {
    const { inventory, hotbarActiveIndex, nowMs } = options;
    if (hotbarActiveIndex === this.lastHotbarActiveIndex) {
      return false;
    }

    this.lastHotbarActiveIndex = hotbarActiveIndex;
    if (hotbarActiveIndex === null) {
      this.hasSeenInitialHotbarSelection = false;
      return false;
    }

    const slot = inventory?.hotbarSlots[hotbarActiveIndex] ?? null;
    if (!this.hasSeenInitialHotbarSelection) {
      this.hasSeenInitialHotbarSelection = true;
      return false;
    }

    this.selectedItemToastLabel = buildSelectedItemLabel(slot);
    this.selectedItemToastShownAtMs = nowMs;
    return true;
  }

  public syncResourceState(inventory: InventorySnapshot | undefined): void {
    syncDiscoveredResources({
      inventory,
      discoveredResourceTypeIds: this.discoveredResourceTypeIds,
      resourceCounts: this.resourceCounts,
    });
  }

  public syncPanels(options: {
    statusPanel: HudPanel;
    effectDetailPanel: HudPanel;
    effectIconView: EffectIconView;
    combatHudView: CombatHudView;
    hotbarView: HotbarView;
    resourceStackView: ResourceStackView;
    playerEntity: ClientEntity | undefined;
    worldEntities: ClientEntity[];
    trackedBuildings: ClientEntity[];
    latestTick: number;
    performanceRates: PerformanceRates;
    tickRate: number;
    inventoryOpen: boolean;
    inventory: InventorySnapshot | undefined;
    hotbarActiveIndex: number | null;
    hotbarItems: HotbarSlotItem[];
  }): void {
    const {
      statusPanel,
      effectDetailPanel,
      effectIconView,
      combatHudView,
      hotbarView,
      resourceStackView,
      playerEntity,
      worldEntities,
      trackedBuildings,
      latestTick,
      performanceRates,
      tickRate,
      inventoryOpen,
      inventory,
      hotbarActiveIndex,
      hotbarItems,
    } = options;
    const activeEffectEntries = buildActiveEffectEntries({
      activeEffects: playerEntity?.activeEffects,
      tickRate,
    });

    const statusContent = buildStatusPanelContent({
      playerEntity,
      latestTick,
      structureCount: trackedBuildings.length,
      entityCount: worldEntities.length,
      tickRate: performanceRates.tickRate,
      frameRate: performanceRates.frameRate,
    });
    statusPanel.setContent(statusContent.title, statusContent.body, {
      minWidth: statusContent.minWidth,
      maxWidth: statusContent.maxWidth,
    });

    effectDetailPanel.setContent(
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
    effectDetailPanel.container.visible = inventoryOpen;
    effectIconView.sync(activeEffectEntries);

    const activeSlot =
      hotbarActiveIndex !== null
        ? (inventory?.hotbarSlots[hotbarActiveIndex] ?? null)
        : null;
    combatHudView.sync(
      buildCombatHudModel({
        playerEntity,
        activeSlot,
      }),
      hotbarView.width,
    );

    hotbarView.setSlots(hotbarItems, hotbarActiveIndex);
    resourceStackView.sync(
      buildResourceStackEntries({
        discoveredResourceTypeIds: this.discoveredResourceTypeIds,
        resourceCounts: this.resourceCounts,
      }),
    );
  }

  public syncDayNight(options: {
    dayNightIndicator: DayNightIndicator;
    dayNight: DayNightSnapshot | undefined;
    latestSnapshotReceivedAt: number | undefined;
  }): void {
    options.dayNightIndicator.sync(
      options.dayNight,
      options.latestSnapshotReceivedAt,
    );
  }

  public layout(options: {
    screenWidth: number;
    screenHeight: number;
    statusPanel: HudPanel;
    effectIconView: EffectIconView;
    resourceStackView: ResourceStackView;
    hotbarView: HotbarView;
    combatHudView: CombatHudView;
    selectedItemToastView: SelectedItemToastView;
    dayNightIndicator: DayNightIndicator;
    effectDetailPanel: HudPanel;
    inventoryOpen: boolean;
    inventoryPanelRect: ScreenRect | null;
  }): void {
    const {
      screenWidth,
      screenHeight,
      statusPanel,
      effectIconView,
      resourceStackView,
      hotbarView,
      combatHudView,
      selectedItemToastView,
      dayNightIndicator,
      effectDetailPanel,
      inventoryOpen,
      inventoryPanelRect,
    } = options;
    const padding = 16;
    const gap = 12;

    statusPanel.setPosition(padding, padding);
    effectIconView.setPosition(
      screenWidth - padding - effectIconView.width,
      padding,
    );
    resourceStackView.setPosition(
      screenWidth - padding - resourceStackView.width,
      screenHeight - padding - resourceStackView.height,
    );

    hotbarView.setPosition(
      Math.floor((screenWidth - hotbarView.width) / 2),
      screenHeight - padding - hotbarView.height,
    );
    combatHudView.setPosition(
      hotbarView.container.x,
      hotbarView.container.y - gap - combatHudView.height,
    );
    selectedItemToastView.setPosition(
      Math.floor((screenWidth - selectedItemToastView.width) / 2),
      combatHudView.container.y - 10 - selectedItemToastView.height,
    );

    if (inventoryPanelRect && inventoryOpen) {
      effectDetailPanel.setPosition(
        Math.floor((screenWidth - effectDetailPanel.width) / 2),
        Math.max(
          padding,
          inventoryPanelRect.y - gap - effectDetailPanel.height,
        ),
      );
      effectDetailPanel.container.visible = true;
    } else {
      effectDetailPanel.container.visible = false;
    }

    dayNightIndicator.setPosition(
      Math.floor((screenWidth - dayNightIndicator.width) / 2),
      padding,
    );
  }

  public syncSelectionToast(options: {
    selectedItemToastView: SelectedItemToastView;
    nowMs: number;
  }): void {
    const alpha = this.getSelectionToastAlpha(options.nowMs);
    options.selectedItemToastView.sync(this.selectedItemToastLabel, alpha);
  }

  public isSelectionToastVisible(nowMs: number): boolean {
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

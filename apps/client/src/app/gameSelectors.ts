import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { getNearDamagedTower as findNearDamagedTower } from "@client/render/hud/towerRepairInteraction.ts";
import { getResourceDisplayLabel } from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import {
  getResourceNamespace,
  getResourcePath,
} from "@shared/ids/ResourceId.ts";
import type {
  DayNightSnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";

export type GameSelectors = {
  getTypePath(typeId: string): string;
  formatTypeLabel(typeId: string): string;
  getWorldEntities(): ClientEntity[];
  getPlayerEntity(): ClientEntity | undefined;
  getTrackedBuildings(): ClientEntity[];
  getCraftingStations(): ClientEntity[];
  getChests(): ClientEntity[];
  getRecyclers(): ClientEntity[];
  getPickups(): ClientEntity[];
  getInventory(): InventorySnapshot | undefined;
  countInventoryType(typeId: string): number;
  hasRecipeResources(recipe: ItemRecipeContent): boolean;
  formatCosts(costs: Array<{ typeId: string; amount: number }>): string;
  getDayNight(): DayNightSnapshot | undefined;
  getNearDamagedTower(): ClientEntity | null;
};

type GameClientSelectorsSource = {
  playerEntityId?: number;
  isInActiveMatch?: () => boolean;
  isLocalPlayerAlive?: () => boolean | null;
  getSpectateTargetEntityId?: () => number | null;
  worldState?: {
    clientWorld?: {
      entities: Map<number, ClientEntity>;
      dayNight: DayNightSnapshot;
    };
  };
};

export function createGameSelectors(
  gameClient: GameClientSelectorsSource,
): GameSelectors {
  function getTypePath(typeId: string): string {
    return getResourcePath(typeId) || typeId;
  }

  function formatTypeLabel(typeId: string): string {
    return getResourceDisplayLabel(typeId);
  }

  function getWorldEntities(): ClientEntity[] {
    return [...(gameClient.worldState?.clientWorld?.entities.values() ?? [])];
  }

  function getPlayerEntity(): ClientEntity | undefined {
    const localPlayerId = gameClient.playerEntityId;
    if (localPlayerId === undefined) {
      return undefined;
    }

    const inMatch = gameClient.isInActiveMatch?.() === true;
    const localAlive = gameClient.isLocalPlayerAlive?.() === true;
    const spectateTargetId = gameClient.getSpectateTargetEntityId?.() ?? null;
    const viewedPlayerId =
      inMatch && !localAlive && spectateTargetId !== null
        ? spectateTargetId
        : localPlayerId;

    return gameClient.worldState?.clientWorld?.entities.get(
      viewedPlayerId,
    );
  }

  function getTrackedBuildings(): ClientEntity[] {
    return getWorldEntities().filter(
      (entity) => getResourceNamespace(entity.typeId) === "building",
    );
  }

  function getCraftingStations(): ClientEntity[] {
    return getTrackedBuildings().filter(
      (entity) => entity.typeId === "building:crafting_station",
    );
  }

  function getChests(): ClientEntity[] {
    return getTrackedBuildings().filter(
      (entity) => entity.typeId === "building:chest",
    );
  }

  function getRecyclers(): ClientEntity[] {
    return getTrackedBuildings().filter(
      (entity) => entity.typeId === "building:recycler",
    );
  }

  function getPickups(): ClientEntity[] {
    return getWorldEntities().filter((entity) => entity.kind === "pickup");
  }

  function getInventory(): InventorySnapshot | undefined {
    return getPlayerEntity()?.inventory;
  }

  function countInventoryType(typeId: string): number {
    const inventory = getInventory();
    if (!inventory) {
      return 0;
    }

    const resourceCount = inventory.resources.reduce((total, resource) => {
      if (resource.typeId !== typeId) {
        return total;
      }
      return total + resource.amount;
    }, 0);
    const slottedCount = inventory.hotbarSlots.reduce((total, slot) => {
      if (slot.kind === "weapon") {
        return total + Number(slot.typeId === typeId);
      }
      if (slot.kind === "buildable" && slot.typeId === typeId) {
        return total + slot.count;
      }
      return total;
    }, 0);
    return resourceCount + slottedCount;
  }

  function hasRecipeResources(recipe: ItemRecipeContent): boolean {
    return recipe.costs.every(
      (cost) => countInventoryType(cost.typeId) >= cost.amount,
    );
  }

  function formatCosts(
    costs: Array<{ typeId: string; amount: number }>,
  ): string {
    return costs
      .map((cost) => `${cost.amount} ${formatTypeLabel(cost.typeId)}`)
      .join(" / ");
  }

  return {
    getTypePath,
    formatTypeLabel,
    getWorldEntities,
    getPlayerEntity,
    getTrackedBuildings,
    getCraftingStations,
    getChests,
    getRecyclers,
    getPickups,
    getInventory,
    countInventoryType,
    hasRecipeResources,
    formatCosts,
    getDayNight: () => gameClient.worldState?.clientWorld?.dayNight,
    getNearDamagedTower: () =>
      findNearDamagedTower(getPlayerEntity(), getTrackedBuildings()),
  };
}

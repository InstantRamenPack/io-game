import type { GameClient } from "@client/client/GameClient.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import {
  getResourceDisplayLabel,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import {
  getResourceNamespace,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";
import type {
  DayNightSnapshot,
  InventorySnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";

export type GameSelectors = {
  getTypePath(typeId: string): string;
  formatTypeLabel(typeId: string): string;
  escapeHtml(value: string): string;
  getWorldEntities(): ClientEntity[];
  getPlayerEntity(): ClientEntity | undefined;
  getTrackedBuildings(): ClientEntity[];
  getInventory(): InventorySnapshot | undefined;
  getHotbarWeapons(): WeaponSnapshot[];
  countInventoryType(typeId: string): number;
  hasRecipeResources(recipe: ItemRecipeContent): boolean;
  formatCosts(costs: Array<{ typeId: string; amount: number }>): string;
  getActiveEffectLabels(): string[];
  getDayNight(): DayNightSnapshot | undefined;
};

export function createGameSelectors(gameClient: GameClient): GameSelectors {
  function getTypePath(typeId: string): string {
    const [, path = typeId] = typeId.split(":");
    return path;
  }

  function formatTypeLabel(typeId: string): string {
    return getResourceDisplayLabel(typeId);
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getWorldEntities(): ClientEntity[] {
    return [...(gameClient.worldState?.clientWorld?.entities.values() ?? [])];
  }

  function getPlayerEntity(): ClientEntity | undefined {
    if (gameClient.playerEntityId === undefined) {
      return undefined;
    }

    return gameClient.worldState?.clientWorld?.entities.get(
      gameClient.playerEntityId,
    );
  }

  function getTrackedBuildings(): ClientEntity[] {
    return getWorldEntities().filter(
      (entity) => getResourceNamespace(entity.typeId) === "building",
    );
  }

  function getInventory(): InventorySnapshot | undefined {
    return getPlayerEntity()?.inventory;
  }

  function getHotbarWeapons(): WeaponSnapshot[] {
    return [...(getInventory()?.weapons ?? [])];
  }

  function countInventoryType(typeId: string): number {
    const inventory = getInventory();
    if (!inventory) {
      return 0;
    }

    const stackableCount = inventory.stackables.reduce((total, stackable) => {
      if (stackable.typeId !== typeId) {
        return total;
      }
      return total + stackable.amount;
    }, 0);
    const weaponCount = inventory.weapons.reduce((total, weapon) => {
      return total + Number(weapon.typeId === (typeId as ResourceId));
    }, 0);
    return stackableCount + weaponCount;
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

  function getActiveEffectLabels(): string[] {
    return (getPlayerEntity()?.activeEffects ?? []).map((effect) => {
      const secondsRemaining = effect.ticksRemaining / gameClient.gameConfig.tickRate;
      return `${formatTypeLabel(effect.typeId)} (${secondsRemaining.toFixed(1)}s)`;
    });
  }

  return {
    getTypePath,
    formatTypeLabel,
    escapeHtml,
    getWorldEntities,
    getPlayerEntity,
    getTrackedBuildings,
    getInventory,
    getHotbarWeapons,
    countInventoryType,
    hasRecipeResources,
    formatCosts,
    getActiveEffectLabels,
    getDayNight: () => gameClient.worldState?.clientWorld?.dayNight,
  };
}

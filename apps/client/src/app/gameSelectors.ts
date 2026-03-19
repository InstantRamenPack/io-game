import type { GameClient } from "@client/client/GameClient.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientItemStack } from "@client/net/ClientItemStack.ts";
import {
  getEntityDefinition,
  getItemDefinition,
} from "@shared/content/index.ts";
import type { RecipeDefinition } from "@shared/content/types.ts";
import {
  getResourceNamespace,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";

/**
 * Describes the read-only selector and formatting helpers used by the client
 * UI layer. These helpers deliberately depend on `GameClient` state only and
 * contain no DOM mutations, which makes them suitable for HUD rendering,
 * debug output, and future view-layer tests.
 */
export type GameSelectors = {
  /**
   * Extracts the path segment from a namespaced resource id such as
   * `building:wall` or `item:crafting_station`.
   */
  getTypePath(typeId: string): string;
  /**
   * Formats an entity or item type id into the player-facing label used by
   * menus, HUD chips, and debug output.
   */
  formatTypeLabel(typeId: string): string;
  /**
   * Escapes arbitrary text before it is embedded into an HTML string.
   */
  escapeHtml(value: string): string;
  /**
   * Returns a snapshot of all currently replicated world entities.
   */
  getWorldEntities(): ClientEntity[];
  /**
   * Returns the locally controlled player entity when the welcome packet has
   * been received and the player still exists in the latest client world.
   */
  getPlayerEntity(): ClientEntity | undefined;
  /**
   * Returns the subset of entities currently classified as buildings.
   */
  getTrackedBuildings(): ClientEntity[];
  /**
   * Returns the local player's inventory as replicated on the latest snapshot.
   */
  getInventoryStacks(): Array<ClientItemStack | null>;
  /**
   * Counts the total stack quantity for a specific item type id.
   */
  countInventoryType(typeId: string): number;
  /**
   * Checks whether the currently replicated inventory can satisfy a recipe.
   */
  hasRecipeResources(recipe: RecipeDefinition): boolean;
  /**
   * Formats a recipe cost list into a concise, player-facing string.
   */
  formatCosts(costs: Array<{ typeId: string; amount: number }>): string;
  /**
   * Returns the active player-side effect labels from the latest snapshot.
   */
  getActiveEffects(): string[];
};

/**
 * Creates a small selector layer around `GameClient` so UI controllers can ask
 * semantic questions such as "what buildings are nearby?" or "how many walls
 * are in inventory?" without duplicating traversal logic in multiple files.
 */
export function createGameSelectors(gameClient: GameClient): GameSelectors {
  function getTypePath(typeId: string): string {
    const [, path = typeId] = typeId.split(":");
    return path;
  }

  function formatTypeLabel(typeId: string): string {
    const itemDefinition = getItemDefinition(typeId as ResourceId);
    if (itemDefinition) {
      return itemDefinition.label;
    }

    const entityDefinition = getEntityDefinition(typeId as ResourceId);
    if (entityDefinition) {
      return entityDefinition.label;
    }

    const baseLabel = getTypePath(typeId).split("/").pop() ?? typeId;
    return baseLabel
      .split(/[_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
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

  function getInventoryStacks(): Array<ClientItemStack | null> {
    return getPlayerEntity()?.inventory ?? [];
  }

  function countInventoryType(typeId: string): number {
    return getInventoryStacks().reduce((total, stack) => {
      if (!stack || stack.typeId !== typeId) {
        return total;
      }

      return total + stack.stackSize;
    }, 0);
  }

  function hasRecipeResources(recipe: RecipeDefinition): boolean {
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

  function getActiveEffects(): string[] {
    return [...(getPlayerEntity()?.activeEffects ?? [])];
  }

  return {
    getTypePath,
    formatTypeLabel,
    escapeHtml,
    getWorldEntities,
    getPlayerEntity,
    getTrackedBuildings,
    getInventoryStacks,
    countInventoryType,
    hasRecipeResources,
    formatCosts,
    getActiveEffects,
  };
}

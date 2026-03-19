import type { RecipeId, RecipeDefinition } from "@shared/content/types.ts";

const recipeDefinitions = {
  "recipe:wall_item": {
    id: "recipe:wall_item",
    label: "Wall Item",
    hint: "Fast perimeter coverage. Cheap and disposable.",
    outputItemTypeId: "item:wall",
    outputAmount: 1,
    costs: [
      { typeId: "item:wood", amount: 20 },
      { typeId: "item:stone", amount: 6 },
    ],
  },
  "recipe:tower_item": {
    id: "recipe:tower_item",
    label: "Tower Item",
    hint: "High ground pressure for outer lanes.",
    outputItemTypeId: "item:tower",
    outputAmount: 1,
    costs: [
      { typeId: "item:wood", amount: 35 },
      { typeId: "item:stone", amount: 30 },
    ],
  },
  "recipe:windmill_item": {
    id: "recipe:windmill_item",
    label: "Windmill Item",
    hint: "Economy piece. Best tucked behind walls.",
    outputItemTypeId: "item:windmill",
    outputAmount: 1,
    costs: [
      { typeId: "item:wood", amount: 45 },
      { typeId: "item:stone", amount: 20 },
    ],
  },
  "recipe:crafting_station_item": {
    id: "recipe:crafting_station_item",
    label: "Crafting Station Item",
    hint: "Unlocks deeper crafting near base center.",
    outputItemTypeId: "item:crafting_station",
    outputAmount: 1,
    costs: [
      { typeId: "item:wood", amount: 30 },
      { typeId: "item:stone", amount: 12 },
    ],
  },
} satisfies Record<RecipeId, RecipeDefinition>;

export const RECIPE_DEFINITIONS = recipeDefinitions;
export const BUILD_RECIPE_IDS = Object.freeze(
  Object.keys(recipeDefinitions) as RecipeId[],
);

export function getRecipeDefinition(recipeId: RecipeId): RecipeDefinition {
  return RECIPE_DEFINITIONS[recipeId];
}

import { describe, expect, test } from "bun:test";
import {
  getAllItemContentEntries,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { pickupsConfig } from "@shared/config/gameplayConfig.ts";

describe("rarity crafting and loot rules", () => {
  test("fists are not authored as an inventory item", () => {
    expect(getItemContent("item:fists" as ResourceId)).toBeUndefined();
  });

  test("common and uncommon weapons and buildings are immediately craftable", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      if (!item.weapon && !item.buildsEntityTypeId) {
        continue;
      }
      if (item.rarityTier !== "common" && item.rarityTier !== "uncommon") {
        continue;
      }
      // fists should not be craftable
      if (typeId === "item:fists") {
        continue;
      }

      expect(item.recipe, `${typeId} should be craftable`).toBeDefined();
      expect(
        item.recipe?.costs.some((cost) => cost.typeId.startsWith("blueprint:")),
        `${typeId} should not require a blueprint`,
      ).toBe(false);
    }
  });

  test("legendary weapons are not craftable, while rare and epic blueprint targets require unlock", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      const blueprintTypeIds = getAllItemContentEntries()
        .filter(([, blueprint]) => blueprint.unlocksRecipeTypeId === typeId)
        .map(([blueprintTypeId]) => blueprintTypeId);
      if (blueprintTypeIds.length === 0) {
        continue;
      }

      if (item.rarityTier === "legendary") {
        expect(item.recipe, `${typeId} should be drop-only`).toBeUndefined();
      }

      if (item.rarityTier === "rare" || item.rarityTier === "epic") {
        expect(
          item.recipe,
          `${typeId} should be craftable after blueprint unlock`,
        ).toBeDefined();
        const blueprintCosts =
          item.recipe?.costs.filter((cost) =>
            cost.typeId.startsWith("blueprint:"),
          ) ?? [];
        expect(
          blueprintCosts,
          `${typeId} should unlock from a blueprint but not consume one`,
        ).toHaveLength(0);
      }
    }
  });

  test("pickup pools only expose common and uncommon weapons and mags plus rare and epic blueprints", () => {
    for (const typeId of pickupsConfig.legacyOrder.weapon) {
      const tier = getItemContent(typeId as ResourceId)?.rarityTier;
      expect(tier).toBeDefined();
      expect(["common", "uncommon"]).toContain(tier ?? "");
    }

    for (const typeId of pickupsConfig.legacyOrder.blueprint) {
      expect(typeId.startsWith("blueprint:")).toBe(true);
      const unlockedTypeId = getItemContent(
        typeId as ResourceId,
      )?.unlocksRecipeTypeId;
      expect(unlockedTypeId).toBeDefined();
      const unlockedRarity = getItemContent(
        unlockedTypeId as ResourceId,
      )?.rarityTier;
      expect(unlockedRarity === "rare" || unlockedRarity === "epic").toBe(true);
    }

    for (const typeId of pickupsConfig.legacyOrder.mag) {
      expect(typeId.startsWith("mag:")).toBe(true);
      const matchingWeapons = getAllItemContentEntries().filter(([, item]) => {
        const weapon = item.weapon;
        return (
          weapon?.attackStyle === "shoot" && weapon.magItemTypeId === typeId
        );
      });
      expect(
        matchingWeapons.length,
        `${typeId} should belong to a weapon`,
      ).toBeGreaterThan(0);
      expect(
        matchingWeapons.some(([, item]) =>
          ["common", "uncommon"].includes(item.rarityTier ?? ""),
        ),
      ).toBe(true);
    }
  });
});

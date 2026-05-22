import { describe, expect, test } from "bun:test";
import {
  getAllItemContentEntries,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { pickupsConfig } from "@shared/config/gameplayConfig.ts";

describe("rarity crafting and loot rules", () => {
  test("common and uncommon weapons and buildings are immediately craftable", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      if (!item.weapon && !item.buildsEntityTypeId) {
        continue;
      }
      if (item.rarityTier !== "common" && item.rarityTier !== "uncommon") {
        continue;
      }

      expect(item.recipe, `${typeId} should be craftable`).toBeDefined();
      expect(
        item.recipe?.costs.some((cost) =>
          cost.typeId.startsWith("item:blueprint_"),
        ),
        `${typeId} should not require a blueprint`,
      ).toBe(false);
    }
  });

  test("rare and legendary weapons are not craftable, while epic weapons require their own blueprint", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      if (!item.weapon) {
        continue;
      }

      if (item.rarityTier === "rare" || item.rarityTier === "legendary") {
        expect(item.recipe, `${typeId} should be drop-only`).toBeUndefined();
      }

      if (item.rarityTier === "epic") {
        const blueprintCosts =
          item.recipe?.costs.filter((cost) =>
            cost.typeId.startsWith("item:blueprint_"),
          ) ?? [];
        expect(
          blueprintCosts,
          `${typeId} should need one blueprint`,
        ).toHaveLength(1);
        expect(
          getItemContent(blueprintCosts[0]!.typeId as ResourceId)
            ?.unlocksRecipeTypeId,
        ).toBe(typeId);
      }
    }
  });

  test("pickup pools only expose common and uncommon weapons and mags plus epic blueprints", () => {
    for (const typeId of pickupsConfig.legacyOrder.weapon) {
      const tier = getItemContent(typeId as ResourceId)?.rarityTier;
      expect(tier).toBeDefined();
      expect(["common", "uncommon"]).toContain(tier ?? "");
    }

    for (const typeId of pickupsConfig.legacyOrder.blueprint) {
      const unlockedTypeId = getItemContent(
        typeId as ResourceId,
      )?.unlocksRecipeTypeId;
      expect(unlockedTypeId).toBeDefined();
      expect(getItemContent(unlockedTypeId as ResourceId)?.rarityTier).toBe(
        "epic",
      );
    }

    for (const typeId of pickupsConfig.legacyOrder.mag) {
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

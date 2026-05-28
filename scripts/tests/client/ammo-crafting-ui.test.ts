import { describe, expect, test } from "bun:test";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getAllItemContentEntries,
  getWeaponContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

function makeHud(unlockedRecipeTypeIds: readonly ResourceId[]): PixiHud {
  return new PixiHud({
    gameClient: {} as ConstructorParameters<typeof PixiHud>[0]["gameClient"],
    selectors: {
      getInventory: () => ({ unlockedRecipeTypeIds }),
    } as GameSelectors,
  });
}

function getCraftingTabForItem(hud: PixiHud, itemTypeId: ResourceId): string {
  return (
    hud as unknown as {
      getCraftingTabForItem(itemTypeId: ResourceId): string;
    }
  ).getCraftingTabForItem(itemTypeId);
}

function getVisibleCraftableTypeIds(hud: PixiHud): readonly ResourceId[] {
  return (
    hud as unknown as {
      getVisibleCraftableTypeIds(): readonly ResourceId[];
    }
  ).getVisibleCraftableTypeIds();
}

describe("ammo crafting HUD", () => {
  test("classifies every craftable mag recipe as ammo", () => {
    const hud = makeHud([]);
    const craftableMagTypeIds = CRAFTABLE_ITEM_TYPE_IDS.filter((typeId) =>
      typeId.startsWith("mag:"),
    );

    expect(craftableMagTypeIds.length).toBeGreaterThan(0);
    for (const typeId of craftableMagTypeIds) {
      expect(getCraftingTabForItem(hud, typeId), typeId).toBe("ammo");
    }
  });

  test("hides mag recipes before the matching gun unlocks them", () => {
    const hud = makeHud([]);
    const visibleCraftableTypeIds = getVisibleCraftableTypeIds(hud);
    const visibleMagTypeIds = visibleCraftableTypeIds.filter((typeId) =>
      typeId.startsWith("mag:"),
    );

    expect(visibleMagTypeIds).toEqual([]);
  });

  test("shows every mag recipe after acquiring its corresponding gun", () => {
    const gunUnlockedMagTypeIds = getAllItemContentEntries()
      .map(([typeId]) => {
        const weapon = getWeaponContent(typeId);
        return weapon?.attackStyle === "shoot"
          ? weapon.magItemTypeId
          : undefined;
      })
      .filter((typeId): typeId is ResourceId => typeId !== undefined);
    const hud = makeHud(gunUnlockedMagTypeIds);
    const visibleCraftableTypeIds = getVisibleCraftableTypeIds(hud);

    for (const magTypeId of gunUnlockedMagTypeIds) {
      expect(visibleCraftableTypeIds, magTypeId).toContain(magTypeId);
    }
  });
});

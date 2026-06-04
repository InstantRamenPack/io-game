import { describe, expect, test } from "bun:test";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";
import { buildCombatHudModel } from "@client/render/hud/hudPresentationModels.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getAllItemContentEntries,
  getWeaponContent,
} from "@shared/content/catalog.ts";
import { HOTBAR_SLOT_COUNT } from "@shared/gameplay/constants.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  InventorySnapshot,
  InventorySlotSnapshot,
} from "@shared/net/snapshots.ts";

function makeInventorySnapshot(
  unlockedRecipeTypeIds: readonly ResourceId[],
  hotbarSlots: readonly InventorySlotSnapshot[] = [],
): InventorySnapshot {
  return {
    resources: [],
    hotbarSlots: Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, index) => hotbarSlots[index] ?? { kind: "empty" },
    ),
    selectedHotbarIndex: 0,
    unlockedRecipeTypeIds: [...unlockedRecipeTypeIds],
  };
}

function makeHud(
  unlockedRecipeTypeIds: readonly ResourceId[],
  hotbarSlots: readonly InventorySlotSnapshot[] = [],
): PixiHud {
  const inventory = makeInventorySnapshot(unlockedRecipeTypeIds, hotbarSlots);
  return new PixiHud({
    gameClient: {} as ConstructorParameters<typeof PixiHud>[0]["gameClient"],
    selectors: {
      getInventory: () => inventory,
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
    const craftableMagTypeIds = new Set(
      CRAFTABLE_ITEM_TYPE_IDS.filter((typeId) => typeId.startsWith("mag:")),
    );
    const gunUnlockedMagTypeIds = getAllItemContentEntries()
      .map(([typeId]) => {
        const weapon = getWeaponContent(typeId);
        return weapon?.attackStyle === "shoot"
          ? weapon.magItemTypeId
          : undefined;
      })
      .filter(
        (typeId): typeId is ResourceId =>
          typeId !== undefined && craftableMagTypeIds.has(typeId),
      );
    const hud = makeHud(gunUnlockedMagTypeIds);
    const visibleCraftableTypeIds = getVisibleCraftableTypeIds(hud);

    for (const magTypeId of gunUnlockedMagTypeIds) {
      expect(visibleCraftableTypeIds, magTypeId).toContain(magTypeId);
    }
  });

  test("shows AK ammo while the player is holding the AK even if the unlock snapshot is stale", () => {
    const hud = makeHud(
      [],
      [
        {
          kind: "weapon",
          typeId: "item:basic_rifle",
        },
      ],
    );
    const visibleCraftableTypeIds = getVisibleCraftableTypeIds(hud);

    expect(visibleCraftableTypeIds).toContain("mag:basic_rifle");
  });

  test("combat HUD ammo totals loaded rounds plus reserve magazine rounds", () => {
    const model = buildCombatHudModel({
      playerEntity: {
        hp: 100,
        maxHp: 100,
      } as Parameters<typeof buildCombatHudModel>[0]["playerEntity"],
      activeSlot: {
        kind: "weapon",
        typeId: "item:basic_rifle",
        ammoInMag: 30,
        magSize: 30,
        reserveMagCount: 4,
      },
    });

    expect(model?.ammo?.ammoInMag).toBe(30);
    expect(model?.ammo?.totalAmmo).toBe(150);
  });
});

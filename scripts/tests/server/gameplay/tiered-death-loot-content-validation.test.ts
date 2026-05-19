import { describe, expect, test } from "bun:test";
import {
  makeParsedEntityContentEntry,
  makeParsedItemContentEntry,
} from "@shared/content/parseContent.ts";

describe("tiered death loot content validation", () => {
  test("rejects enemy content missing rarity tier", () => {
    expect(() =>
      makeParsedEntityContentEntry("enemy", "test_enemy", {
        label: "Test Enemy",
        maxHp: 100,
        moveSpeed: 10,
        deathLoot: {},
      }),
    ).toThrow(/must define rarityTier/);
  });

  test("rejects enemy content missing deathLoot", () => {
    expect(() =>
      makeParsedEntityContentEntry("enemy", "test_enemy", {
        label: "Test Enemy",
        maxHp: 100,
        moveSpeed: 10,
        rarityTier: "common",
      }),
    ).toThrow(/must define deathLoot/);
  });

  test("rejects weapon item content missing rarity tier", () => {
    expect(() =>
      makeParsedItemContentEntry("test_weapon", {
        label: "Test Weapon",
        weapon: {
          attackStyle: "jab",
          cooldownTicks: 1,
          range: 10,
          damage: 1,
          knockback: 0,
          jabWidth: 8,
          equippedRender: {
            holdOffset: { x: 0, y: 0 },
          },
        },
      }),
    ).toThrow(/weapon items must define rarityTier/);
  });

  test("rejects buildable item content missing rarity tier", () => {
    expect(() =>
      makeParsedItemContentEntry("test_buildable", {
        label: "Test Buildable",
        buildsEntityTypeId: "building:wall",
      }),
    ).toThrow(/buildable items must define rarityTier/);
  });
});

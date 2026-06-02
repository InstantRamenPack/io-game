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

  test("rejects enemy spawn weapons without at least one valid type id", () => {
    expect(() =>
      makeParsedEntityContentEntry("enemy", "test_enemy", {
        label: "Test Enemy",
        maxHp: 100,
        moveSpeed: 10,
        rarityTier: "common",
        deathLoot: {},
        spawnWeapons: {
          selection: "rotating",
          typeIds: [],
        },
      }),
    ).toThrow(/spawnWeapons[\s\S]*typeIds[\s\S]*Too small/);
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
        },
        rendering: {
          assetPath: "/placeholder.png",
          sprite: {
            x: 0,
            y: 0,
            rotationDeg: 0,
            scale: 1,
            handedness: "right",
            recoilDistance: 0,
            swingAngleDeg: 0,
            jabDistance: 0,
          },
          icon: {
            x: 0,
            y: 0,
            rotationDeg: 0,
            scale: 1,
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
        rendering: {
          assetPath: "/placeholder.png",
          sprite: {
            x: 0,
            y: 0,
            rotationDeg: 0,
            scale: 1,
            handedness: "right",
            recoilDistance: 0,
            swingAngleDeg: 0,
            jabDistance: 0,
          },
          icon: {
            x: 0,
            y: 0,
            rotationDeg: 0,
            scale: 1,
          },
        },
      }),
    ).toThrow(/buildable items must define rarityTier/);
  });

  test("accepts negative item rendering tuning values", () => {
    expect(() =>
      makeParsedItemContentEntry("test_negative_rendering", {
        label: "Test Negative Rendering",
        rarityTier: "common",
        weapon: {
          attackStyle: "jab",
          cooldownTicks: 1,
          range: 10,
          damage: 1,
          knockback: 0,
          jabWidth: 8,
        },
        rendering: {
          assetPath: "/placeholder.png",
          sprite: {
            x: -12,
            y: -8,
            rotationDeg: -45,
            scale: -1,
            handedness: "right",
            recoilDistance: -4,
            swingAngleDeg: -30,
            jabDistance: -10,
          },
          icon: {
            x: -3,
            y: -5,
            rotationDeg: -20,
            scale: -0.5,
          },
        },
      }),
    ).not.toThrow();
  });
});

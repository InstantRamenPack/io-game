import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  getAllItemContentEntries,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const repoRoot = process.cwd();
const iconMap = JSON.parse(
  readFileSync(
    path.join(repoRoot, "apps/client/public/item_icons.json"),
    "utf8",
  ),
) as Record<string, string>;
const spriteMap = JSON.parse(
  readFileSync(
    path.join(repoRoot, "apps/client/public/item_sprites.json"),
    "utf8",
  ),
) as Record<string, string>;

describe("mag item content", () => {
  test("legacy item namespace ammo, blueprint, and fists ids are deleted", () => {
    const itemTypeIds = new Set(
      getAllItemContentEntries().map(([typeId]) => typeId),
    );

    expect(itemTypeIds.has("item:fists" as ResourceId)).toBe(false);
    for (const typeId of itemTypeIds) {
      expect(
        typeId.startsWith("item:blueprint_"),
        `${typeId} should use the blueprint:* content namespace`,
      ).toBe(false);
      expect(
        typeId.endsWith("_mag"),
        `${typeId} should use the mag:* content namespace`,
      ).toBe(false);
    }
  });

  test("every shooting weapon reloads from its own namespaced magazine resource", () => {
    const seenMagTypeIds = new Set<ResourceId>();

    for (const [typeId, item] of getAllItemContentEntries()) {
      if (item.weapon?.attackStyle !== "shoot") {
        continue;
      }

      const magItemTypeId = item.weapon.magItemTypeId;
      expect(
        magItemTypeId,
        `${typeId} should declare a mag item so reload count and HUD icons share one source`,
      ).toBeDefined();
      expect(
        magItemTypeId?.startsWith("mag:"),
        `${typeId} should reload from a mag:* resource, not an item:* resource`,
      ).toBe(true);
      expect(
        seenMagTypeIds.has(magItemTypeId as ResourceId),
        `${magItemTypeId} should not be shared by multiple shoot weapons`,
      ).toBe(false);
      seenMagTypeIds.add(magItemTypeId as ResourceId);
      expect(
        getItemContent(magItemTypeId as ResourceId),
        `${typeId} mag ${magItemTypeId} should exist as item content`,
      ).toBeDefined();
    }
  });

  test("magazine pickups have HUD icon and sprite mappings backed by files", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      if (!item.pickupSpawn?.pools.includes("mag")) {
        continue;
      }

      const iconPath = iconMap[typeId];
      expect(iconPath, `${typeId} should have an item icon`).toBeDefined();
      if (!iconPath) {
        throw new Error(`${typeId} should have an item icon`);
      }
      expect(
        existsSync(path.join(repoRoot, "apps/client/public", iconPath)),
        `${typeId} icon ${iconPath} should exist`,
      ).toBe(true);
      const spritePath = spriteMap[typeId];
      expect(spritePath, `${typeId} should have an item sprite`).toBeDefined();
      if (!spritePath) {
        throw new Error(`${typeId} should have an item sprite`);
      }
      expect(
        existsSync(path.join(repoRoot, "apps/client/public", spritePath)),
        `${typeId} sprite ${spritePath} should exist`,
      ).toBe(true);
    }
  });
});

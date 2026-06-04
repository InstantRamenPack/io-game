import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  getAllItemContentEntries,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const repoRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};

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

  test("item-like content owns explicit rendering paths backed by files or placeholder", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      expect(
        typeof item.rendering.assetPath,
        `${typeId} should own an asset path`,
      ).toBe("string");
      expect(
        item.rendering.assetPath.length,
        `${typeId} should own a non-empty asset path`,
      ).toBeGreaterThan(0);
      expect(
        typeof item.rendering.sprite.x,
        `${typeId} should own sprite tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.sprite.y,
        `${typeId} should own sprite tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.sprite.scale,
        `${typeId} should own sprite tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.sprite.rotationDeg,
        `${typeId} should own sprite tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.icon.x,
        `${typeId} should own icon tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.icon.y,
        `${typeId} should own icon tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.icon.scale,
        `${typeId} should own icon tuning`,
      ).toBe("number");
      expect(
        typeof item.rendering.icon.rotationDeg,
        `${typeId} should own icon tuning`,
      ).toBe("number");
      expect(
        existsSync(
          path.join(repoRoot, "apps/client/public", item.rendering.assetPath),
        ),
        `${typeId} asset ${item.rendering.assetPath} should exist`,
      ).toBe(true);
    }
  });

  test("generated mag and blueprint rendering assets use generated public folders", () => {
    for (const [typeId, item] of getAllItemContentEntries()) {
      if (!typeId.startsWith("mag:") && !typeId.startsWith("blueprint:")) {
        continue;
      }
      const expectedPrefix = typeId.startsWith("mag:")
        ? "/mag/generated/"
        : "/blueprint/generated/";
      expect(item.rendering.assetPath.startsWith(expectedPrefix)).toBe(true);
      expect(
        existsSync(
          path.join(repoRoot, "apps/client/public", item.rendering.assetPath),
        ),
        `${typeId} generated asset ${item.rendering.assetPath} should exist`,
      ).toBe(true);
    }
  });

  test("generated prep runs the single content manifest generator", () => {
    expect(packageJson.scripts?.["prepare:generated"]).toBe(
      "bun run generate:content-manifest && bun run generate:fast-input-parser",
    );
    expect(packageJson.scripts?.["generate:mag-items"]).toBeUndefined();
    expect(packageJson.scripts?.postinstall).toContain("prepare:generated");
  });
});

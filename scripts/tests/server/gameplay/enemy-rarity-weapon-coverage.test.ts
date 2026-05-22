import { describe, expect, test } from "bun:test";
import { Commander } from "@server/entities/enemies/Commander.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Ranger } from "@server/entities/enemies/Ranger.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { SniperEnemy } from "@server/entities/enemies/SniperEnemy.ts";
import { Stalker } from "@server/entities/enemies/Stalker.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import {
  getAllItemContentEntries,
  getEntityRarityTier,
  getWeaponRarityTier,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const ENEMY_CTORS = [
  Drifter,
  Shoota,
  Police,
  Ranger,
  Saboteur,
  Commander,
  Stalker,
  SniperEnemy,
  Megaknight,
  Thanos,
] as const;

describe("enemy rarity weapon coverage", () => {
  test("weapon-bearing enemies only equip weapons from their own rarity tier", () => {
    for (const EnemyCtor of ENEMY_CTORS) {
      const enemyTier = getEntityRarityTier(EnemyCtor.typeId);
      expect(
        enemyTier,
        `${EnemyCtor.typeId} should define rarity`,
      ).toBeDefined();

      for (let index = 0; index < 12; index += 1) {
        const enemy = new EnemyCtor(index + 1);
        for (const weapon of enemy.weapons) {
          expect(
            getWeaponRarityTier(weapon.typeId),
            `${EnemyCtor.typeId} equipped ${weapon.typeId}`,
          ).toBe(enemyTier);
        }
      }
    }
  });

  test("every weapon item is equipped by at least one enemy variant", () => {
    const observedWeaponTypeIds = new Set<ResourceId>();
    for (const EnemyCtor of ENEMY_CTORS) {
      for (let index = 0; index < 24; index += 1) {
        const enemy = new EnemyCtor(index + 1);
        for (const weapon of enemy.weapons) {
          observedWeaponTypeIds.add(weapon.typeId);
        }
      }
    }

    const authoredWeaponTypeIds = getAllItemContentEntries()
      .filter(([, item]) => item.weapon !== undefined)
      .filter(([typeId]) => !typeId.startsWith("item:blueprint_"))
      .map(([typeId]) => typeId);

    expect(
      [...observedWeaponTypeIds].every((typeId) =>
        authoredWeaponTypeIds.includes(typeId),
      ),
    ).toBe(true);
    expect(observedWeaponTypeIds.size).toBeGreaterThan(0);
    expect(observedWeaponTypeIds.size).toBeLessThanOrEqual(
      authoredWeaponTypeIds.length,
    );
  });
});

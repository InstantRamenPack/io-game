import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import { enemyTuningConfig } from "@shared/config/gameplayConfig.ts";
import type {
  JabWeaponContent,
  ShootWeaponContent,
  SwingWeaponContent,
} from "@shared/content/schema.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("drifter combat content", () => {
  test("uses full weapon damage with split enemy cadence and range nerfs", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    for (const entity of runtime.world.entities.all()) {
      runtime.world.despawn(entity.id);
    }
    const player = spawnPlayerLikeDynamic(runtime, 120, 100);
    const drifter = spawnEnemy(runtime, "drifter", 100, 100) as Enemy;
    const weapon = drifter.weapons[0];
    expect(weapon).toBeDefined();
    const weaponContent = getWeaponContent(weapon!.typeId) as
      | SwingWeaponContent
      | JabWeaponContent
      | ShootWeaponContent;
    const expectedDamage =
      weaponContent.damage * player.getDamageReductionMultiplier();
    expect(drifter.damageMultiplier).toBe(1);
    expect((weapon as unknown as { range: number }).range).toBe(
      weaponContent.range * enemyTuningConfig.weaponAttackRangeMultiplier,
    );

    player.hp = 100;
    const startingHp = player.hp;
    tick(runtime, 2);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    const cooldownMultiplier =
      weaponContent.attackStyle === "shoot"
        ? enemyTuningConfig.rangedWeaponCooldownMultiplier
        : enemyTuningConfig.meleeWeaponCooldownMultiplier;
    const tunedCooldownTicks = Math.max(
      1,
      Math.floor(weaponContent.cooldownTicks * cooldownMultiplier),
    );

    tick(runtime, tunedCooldownTicks);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage * 2, 5);
  });
});

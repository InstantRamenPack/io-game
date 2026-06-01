import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import {
  requireProjectileContent,
  requireWeaponContent,
} from "@shared/content/catalog.ts";
import { enemyTuningConfig } from "@shared/config/gameplayConfig.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("enemy weapon tuning day/night", () => {
  test("day nerfs soften at night and lift only on daytime power loss", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const shoota = spawnEnemy(runtime, "shoota", 100, 100) as Enemy;
    const weapon = shoota.weapons[0] as Enemy["weapons"][number] & {
      getProjectileRange(): number;
    };
    const projectileContent = requireProjectileContent(
      "projectile:basic_bullet",
    );
    const weaponContent = requireWeaponContent("item:basic_gun");
    if (weaponContent.attackStyle !== "shoot") {
      throw new Error("expected basic gun to remain a shoot weapon");
    }

    runtime.world.dayNightSystem.setPhase("day");
    tick(runtime, 1);
    expect(weapon.getProjectileRange()).toBe(
      projectileContent.range * enemyTuningConfig.weaponAttackRangeMultiplier,
    );

    runtime.world.dayNightSystem.setPhase("night");
    tick(runtime, 1);
    expect(weapon.getProjectileRange()).toBe(
      projectileContent.range *
        enemyTuningConfig.nightWeaponAttackRangeMultiplier,
    );
    expect(weapon.hit(runtime.world, shoota, 0)).toBe(true);
    expect(weapon.toSnapshot().cooldownTicksRemaining).toBe(
      Math.floor(
        weaponContent.cooldownTicks *
          enemyTuningConfig.nightRangedWeaponCooldownMultiplier,
      ),
    );

    runtime.world.dayNightSystem.setPhase("day");
    tick(runtime, 1);
    for (const entity of runtime.world.entities.all()) {
      if (entity instanceof EnergyTower) {
        entity.hp = 0;
        entity.alive = false;
      }
    }
    tick(runtime, 1);
    expect(weapon.getProjectileRange()).toBe(projectileContent.range);
  });
});

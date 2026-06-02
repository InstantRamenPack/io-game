import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import type { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import {
  requireProjectileContent,
  requireWeaponContent,
} from "@shared/content/catalog.ts";
import { enemyTuningConfig } from "@shared/config/gameplayConfig.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  spawnWall,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("enemy weapon tuning", () => {
  test("gun and rifle use degree-based spread with the gun less accurate", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    runtime.world.randomNumberGenerator = Object.assign(() => 1, {
      double: () => 1,
      int32: () => 0,
      quick: () => 1,
    });
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const gunContent = requireWeaponContent("item:basic_gun");
    const rifleContent = requireWeaponContent("item:basic_rifle");
    if (
      gunContent.attackStyle !== "shoot" ||
      rifleContent.attackStyle !== "shoot"
    ) {
      throw new Error("expected gun and rifle to remain shoot weapons");
    }

    expect(rifleContent.spreadDeg).toBeGreaterThan(0);

    const gun = new BasicGun();
    expect(gun.hit(runtime.world, player, 0)).toBe(true);

    const projectile = runtime.world.entities
      .all()
      .find((entity) => entity instanceof Projectile) as Projectile | undefined;
    expect(projectile).toBeDefined();
    expect(projectile?.rotation).toBeCloseTo(
      (gunContent.spreadDeg * Math.PI) / 360,
    );
  });

  test("saboteur uses the basic sword and doubles damage against buildings", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const saboteur = spawnEnemy(runtime, "saboteur", 100, 100) as Saboteur;
    const player = spawnPlayerLikeDynamic(runtime, 120, 100);
    const wall = spawnWall(runtime, 140, 100);
    expect(saboteur.weapons[0]?.typeId).toBe("item:basic_sword");
    expect(saboteur.getOutgoingDamageMultiplier(player)).toBe(1);
    expect(saboteur.getOutgoingDamageMultiplier(wall)).toBe(2);
  });

  test("shoota carries the regular gun with enemy-only cadence and range nerfs", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    runtime.world.dayNightSystem.setPhase("day");
    const shoota = spawnEnemy(runtime, "shoota", 100, 100) as Enemy;
    tick(runtime, 1);
    const weapon = shoota.weapons[0];
    expect(weapon?.typeId).toBe("item:basic_gun");

    const weaponContent = requireWeaponContent("item:basic_gun");
    const projectileContent = requireProjectileContent(
      "projectile:basic_bullet",
    );
    if (weaponContent.attackStyle !== "shoot") {
      throw new Error("expected basic gun to remain a shoot weapon");
    }
    const rangedWeapon = weapon as typeof weapon & {
      getProjectileRange(): number;
    };
    expect(shoota.damageMultiplier).toBe(1);
    expect(rangedWeapon.getProjectileRange()).toBe(
      projectileContent.range * enemyTuningConfig.weaponAttackRangeMultiplier,
    );

    const tunedRange =
      projectileContent.range * enemyTuningConfig.weaponAttackRangeMultiplier;
    const inRangeTarget = spawnPlayerLikeDynamic(
      runtime,
      shoota.x + tunedRange - 10,
      shoota.y,
    );
    const outOfRangeTarget = spawnPlayerLikeDynamic(
      runtime,
      shoota.x + tunedRange + 10,
      shoota.y,
    );
    expect(
      rangedWeapon.canHitTarget(runtime.world, shoota, inRangeTarget),
    ).toBe(true);
    expect(
      rangedWeapon.canHitTarget(runtime.world, shoota, outOfRangeTarget),
    ).toBe(false);

    expect(rangedWeapon.hit(runtime.world, shoota, 0)).toBe(true);
    expect(rangedWeapon.toSnapshot().cooldownTicksRemaining).toBe(
      Math.floor(
        weaponContent.cooldownTicks *
          enemyTuningConfig.rangedWeaponCooldownMultiplier,
      ),
    );
    const projectile = runtime.world.entities
      .all()
      .find((entity) => entity instanceof Projectile) as Projectile | undefined;
    expect(projectile?.typeId).toBe("projectile:basic_bullet");
    expect(projectile?.remainingRange).toBe(
      projectileContent.range * enemyTuningConfig.weaponAttackRangeMultiplier,
    );
  });

  test("ranged enemy projectiles use the enemy tuning damage multiplier", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    runtime.world.dayNightSystem.setPhase("day");
    const shoota = spawnEnemy(runtime, "shoota", 100, 100) as Enemy;
    const player = spawnPlayerLikeDynamic(runtime, 160, 100);
    tick(runtime, 1);

    const weapon = shoota.weapons[0];
    expect(weapon?.hit(runtime.world, shoota, 0)).toBe(true);
    const projectile = runtime.world.entities
      .all()
      .find((entity) => entity instanceof Projectile) as Projectile | undefined;
    expect(projectile).toBeDefined();
    if (!projectile) {
      throw new Error("expected shoota shot to spawn a projectile");
    }

    const projectileContent = requireProjectileContent(
      "projectile:basic_bullet",
    );
    const startingHp = player.hp;
    new DamageEffect(projectileContent.damage).apply(
      runtime.world,
      projectile,
      player,
    );

    expect(player.hp).toBe(
      startingHp -
        projectileContent.damage * enemyTuningConfig.rangedDamageMultiplier,
    );
  });

  test("ranged enemies pursue targets beyond weapon range without firing", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    runtime.world.dayNightSystem.setPhase("day");
    const shoota = spawnEnemy(runtime, "shoota", 6160, 500) as Enemy;
    tick(runtime, 1);
    const projectileContent = requireProjectileContent(
      "projectile:basic_bullet",
    );
    const tunedRange =
      projectileContent.range * enemyTuningConfig.weaponAttackRangeMultiplier;
    const player = spawnPlayerLikeDynamic(
      runtime,
      shoota.x - tunedRange - 101,
      shoota.y,
    );
    const startX = shoota.x;

    tick(runtime, 2);

    expect(shoota.targetId).toBe(player.id);
    expect(shoota.x).toBeLessThan(startX);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof Projectile),
    ).toHaveLength(0);

    player.x = shoota.x + tunedRange - 1;
    tick(runtime, 1);

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof Projectile),
    ).toHaveLength(1);
  });
});

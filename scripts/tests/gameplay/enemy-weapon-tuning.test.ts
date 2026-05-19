import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import {
  requireProjectileContent,
  requireWeaponContent,
} from "@shared/content/catalog.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
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

    expect(gunContent.spreadDeg).toBe(15);
    expect(rifleContent.spreadDeg).toBeGreaterThan(0);
    expect(gunContent.spreadDeg).toBeGreaterThan(rifleContent.spreadDeg);

    const gun = new BasicGun();
    expect(gun.hit(runtime.world, player, 0)).toBe(true);

    const projectile = runtime.world.entities
      .all()
      .find((entity) => entity instanceof Projectile) as Projectile | undefined;
    expect(projectile).toBeDefined();
    expect(projectile?.rotation).toBeCloseTo((15 * Math.PI) / 360);
  });

  test("shoota carries the regular gun with enemy-only cadence and range nerfs", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const shoota = spawnEnemy(runtime, "shoota", 100, 100) as Enemy;
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
      projectileContent.range * 0.5,
    );

    const inRangeTarget = spawnPlayerLikeDynamic(runtime, 590, 100);
    const outOfRangeTarget = spawnPlayerLikeDynamic(runtime, 610, 100);
    expect(
      rangedWeapon.canHitTarget(runtime.world, shoota, inRangeTarget),
    ).toBe(true);
    expect(
      rangedWeapon.canHitTarget(runtime.world, shoota, outOfRangeTarget),
    ).toBe(false);

    expect(rangedWeapon.hit(runtime.world, shoota, 0)).toBe(true);
    expect(rangedWeapon.toSnapshot().cooldownTicksRemaining).toBe(
      weaponContent.cooldownTicks * 4,
    );
    const projectile = runtime.world.entities
      .all()
      .find((entity) => entity instanceof Projectile) as Projectile | undefined;
    expect(projectile?.typeId).toBe("projectile:basic_bullet");
    expect(projectile?.remainingRange).toBe(projectileContent.range * 0.5);
  });

  test("ranged enemy pursues beyond screen range but only fires within five hundred units", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const shoota = spawnEnemy(runtime, "shoota", 6160, 500) as Enemy;
    const player = spawnPlayerLikeDynamic(runtime, 5559, 500);
    const startX = shoota.x;

    tick(runtime, 2);

    expect(shoota.targetId).toBe(player.id);
    expect(shoota.x).toBeLessThan(startX);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof Projectile),
    ).toHaveLength(0);

    player.x = shoota.x + 499;
    tick(runtime, 1);

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof Projectile),
    ).toHaveLength(1);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { EnergyTower } from "@server/entities/tower/EnergyTower.ts";
import {
  requireProjectileContent,
  requireWeaponContent,
} from "@shared/content/catalog.ts";
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
  beforeAll(bootstrapTestRegistries);

  test("uses full weapon damage with split enemy cadence and range nerfs", () => {
    const { runtime } = makeRuntime();
    for (const entity of runtime.world.entities.all()) {
      runtime.world.despawn(entity.id);
    }
    runtime.world.dayNightSystem.setPhase("day");
    const energyTower = new EnergyTower(runtime.world.allocEntityId());
    runtime.world.spawn(energyTower);
    runtime.world.infrastructureSystem?.registerTowersFromWorld(runtime.world);
    const player = spawnPlayerLikeDynamic(runtime, 1000, 1000);
    const drifter = spawnEnemy(runtime, "drifter", 100, 100) as Enemy;
    const weapon = drifter.weapons[0];
    expect(weapon).toBeDefined();
    const weaponContent = requireWeaponContent(weapon!.typeId) as
      | SwingWeaponContent
      | JabWeaponContent
      | ShootWeaponContent;
    const rawDamage =
      weaponContent.attackStyle === "shoot"
        ? requireProjectileContent(weaponContent.projectileTypeId).damage
        : weaponContent.damage;
    const rawRange =
      weaponContent.attackStyle === "shoot"
        ? requireProjectileContent(weaponContent.projectileTypeId).range
        : weaponContent.range;
    const expectedDamage = rawDamage * player.getDamageReductionMultiplier();
    tick(runtime, 1);

    expect(drifter.damageMultiplier).toBe(1);
    expect((weapon as unknown as { range: number }).range).toBe(
      rawRange * enemyTuningConfig.weaponAttackRangeMultiplier,
    );

    player.hp = 100;
    player.x = drifter.x + 8;
    player.y = drifter.y;
    runtime.world.markSpatialDirty();
    runtime.world.ensureSpatialIndex();
    const startingHp = player.hp;
    expect(weapon!.hit(runtime.world, drifter, 0)).toBe(true);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    const cooldownMultiplier =
      weaponContent.attackStyle === "shoot"
        ? enemyTuningConfig.rangedWeaponCooldownMultiplier
        : enemyTuningConfig.meleeWeaponCooldownMultiplier;
    const tunedCooldownTicks = Math.max(
      1,
      Math.floor(weaponContent.cooldownTicks * cooldownMultiplier),
    );
    expect(weapon!.toSnapshot().cooldownTicksRemaining).toBe(
      tunedCooldownTicks,
    );
  });
});

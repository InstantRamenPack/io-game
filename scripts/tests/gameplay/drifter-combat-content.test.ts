import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import type {
  JabWeaponContent,
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
  test("uses full weapon damage with global enemy cadence and range nerfs", () => {
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
      | JabWeaponContent;
    const expectedDamage =
      weaponContent.damage * player.getDamageReductionMultiplier();
    expect(drifter.damageMultiplier).toBe(1);
    expect((weapon as unknown as { range: number }).range).toBe(
      weaponContent.range * 0.5,
    );

    player.hp = 100;
    const startingHp = player.hp;
    tick(runtime, 2);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    tick(runtime, weaponContent.cooldownTicks);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    tick(runtime, weaponContent.cooldownTicks * 3);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage * 2, 5);
  });
});

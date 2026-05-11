import { describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import {
  getWeaponContent,
  requireEntityContent,
} from "@shared/content/catalog.ts";
import type { SwingWeaponContent } from "@shared/content/schema.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("drifter combat content", () => {
  test("uses content-owned damage multiplier and melee cadence", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 120, 100);
    const drifter = spawnEnemy(runtime, "drifter", 100, 100) as Enemy;
    const drifterContent = requireEntityContent("enemy:drifter");
    const weaponContent = getWeaponContent(
      drifter.weapons[0]?.typeId ?? "item:zombie_sword",
    ) as SwingWeaponContent;
    const attackMinIntervalTicks =
      drifterContent.combat?.attackMinIntervalTicks ?? 0;
    const expectedDamage =
      weaponContent.damage *
      (drifterContent.combat?.damageMultiplier ?? 1) *
      player.getDamageReductionMultiplier();
    expect(drifter.damageMultiplier).toBe(0.5);
    expect(attackMinIntervalTicks).toBe(50);

    const startingHp = player.hp;
    tick(runtime, 2);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    tick(runtime, attackMinIntervalTicks);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage, 5);

    tick(runtime, weaponContent.cooldownTicks);
    expect(player.hp).toBeCloseTo(startingHp - expectedDamage * 2, 5);
  });
});

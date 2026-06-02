import { beforeAll, describe, expect, test } from "bun:test";
import { requireSwingWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { Katana } from "@server/items/weapons/Katana.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
} from "@tests/helpers/worldFixtures.ts";
import { resolveKatanaChainWindowTicks } from "@shared/gameplay/katanaCombo.ts";
import type { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";

function waitForKatanaCooldown(
  katana: Katana,
  runtime: GameInstanceRuntime,
): void {
  const weaponContent = requireSwingWeaponRuntime("item:katana");
  for (let index = 0; index < weaponContent.cooldownTicks; index += 1) {
    katana.tick(runtime.world);
  }
}

describe("katana combo", () => {
  beforeAll(bootstrapTestRegistries);

  test("chains sweep, sweep, then stab damage while attacks stay within the chain window", () => {
    const weaponContent = requireSwingWeaponRuntime("item:katana");
    const combo = weaponContent.combo;
    expect(combo).toBeDefined();

    const { runtime } = makeRuntime();
    const owner = spawnPlayerLikeDynamic(runtime, 1000, 1000);
    const target = spawnEnemy(runtime, "megaknight", 1060, 1000);
    target.hp = 500;
    target.maxHp = 500;
    runtime.world.ensureSpatialIndex();

    const katana = new Katana();
    const baseDamage = weaponContent.damage;
    const stabDamage = baseDamage * (combo?.stabDamageMultiplier ?? 1);

    const hp0 = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hp0 - target.hp).toBe(baseDamage);

    waitForKatanaCooldown(katana, runtime);
    const hp1 = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hp1 - target.hp).toBe(baseDamage);

    waitForKatanaCooldown(katana, runtime);
    const hp2 = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hp2 - target.hp).toBe(stabDamage);
  });

  test("resets to the opening sweep after the chain window expires without another attack", () => {
    const weaponContent = requireSwingWeaponRuntime("item:katana");
    const combo = weaponContent.combo;
    expect(combo).toBeDefined();

    const chainWindowTicks = resolveKatanaChainWindowTicks(
      combo!,
      weaponContent.cooldownTicks,
    );
    const { runtime } = makeRuntime();
    const owner = spawnPlayerLikeDynamic(runtime, 1000, 1000);
    const target = spawnEnemy(runtime, "megaknight", 1060, 1000);
    target.hp = 500;
    target.maxHp = 500;
    runtime.world.ensureSpatialIndex();

    const katana = new Katana();
    const baseDamage = weaponContent.damage;
    const stabDamage = baseDamage * (combo?.stabDamageMultiplier ?? 1);

    const hp0 = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hp0 - target.hp).toBe(baseDamage);
    waitForKatanaCooldown(katana, runtime);

    const hp1 = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hp1 - target.hp).toBe(baseDamage);
    waitForKatanaCooldown(katana, runtime);
    runtime.world.tick += chainWindowTicks + 1;

    const hpBeforeThirdSwing = target.hp;
    expect(katana.hit(runtime.world, owner, 0)).toBe(true);
    expect(hpBeforeThirdSwing - target.hp).toBe(baseDamage);
    expect(hpBeforeThirdSwing - target.hp).not.toBe(stabDamage);
  });
});

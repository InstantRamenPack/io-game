import { beforeAll, describe, expect, test } from "bun:test";
import { CrateStructure } from "@server/entities/structures/CrateStructure.ts";
import { TripwireStructure } from "@server/entities/structures/TripwireStructure.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { Wither } from "@server/entities/enemies/Wither.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import deathLootConfig from "@shared/content/death_loot.json";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  playerDamageSourceId,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("dungeon runtime mechanics", () => {
  beforeAll(bootstrapTestRegistries);

  test("enemy death drops tiered hunks and optional tiered matching ammo", () => {
    const { runtime } = makeRuntime({ worldSeed: 22 });
    const enemy = new Shoota(runtime.world.allocEntityId());
    enemy.x = runtime.world.gameConfig.worldSize.w / 2;
    enemy.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(enemy);

    enemy.applyDamage(
      runtime.world,
      enemy.maxHp * 4,
      playerDamageSourceId(runtime),
    );

    const pickup = findPickupAt(runtime, enemy.x, enemy.y);
    const hunkCount = pickup.contents.countType("item:hunk" as ResourceId);
    expect(hunkCount).toBeGreaterThanOrEqual(deathLootConfig.common.hunkMin);
    expect(hunkCount).toBeLessThanOrEqual(deathLootConfig.common.hunkMax);
    const magCount = pickup.contents.countType("mag:basic_gun" as ResourceId);
    expect([
      0,
      ...rangeInclusive(
        deathLootConfig.common.magMin,
        deathLootConfig.common.magMax,
      ),
    ]).toContain(magCount);
  });

  test("enemy death loot randomness is repeatable per seed and diverges across seeds", () => {
    const first = simulateWaveAndFirstDeathDrop(1337);
    const second = simulateWaveAndFirstDeathDrop(1337);
    const third = simulateWaveAndFirstDeathDrop(7331);

    expect(second).toEqual(first);
    expect(third).not.toEqual(first);
  });

  test("same-tick multi-kill loot does not reuse dead enemy ids", () => {
    const { runtime } = makeRuntime({ worldSeed: 99 });
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const firstEnemy = new Shoota(runtime.world.allocEntityId());
    const secondEnemy = new Shoota(runtime.world.allocEntityId());
    firstEnemy.x = x;
    firstEnemy.y = y;
    secondEnemy.x = x + 16;
    secondEnemy.y = y;
    runtime.world.spawn(firstEnemy);
    runtime.world.spawn(secondEnemy);
    const deadEnemyIds = new Set([firstEnemy.id, secondEnemy.id]);

    firstEnemy.applyDamage(
      runtime.world,
      firstEnemy.maxHp * 4,
      playerDamageSourceId(runtime),
    );
    secondEnemy.applyDamage(
      runtime.world,
      secondEnemy.maxHp * 4,
      playerDamageSourceId(runtime),
    );

    const pickups = runtime.world.entities
      .all()
      .filter((entity): entity is ItemEntity => entity instanceof ItemEntity);
    expect(pickups).toHaveLength(2);
    for (const pickup of pickups) {
      expect(deadEnemyIds.has(pickup.id)).toBe(false);
    }
  });

  test("Thanos guaranteed drop yields one random carried weapon on death", () => {
    const { runtime } = makeRuntime();
    const thanos = new Thanos(runtime.world.allocEntityId());
    thanos.x = runtime.world.gameConfig.worldSize.w / 2;
    thanos.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(thanos);

    thanos.applyDamage(
      runtime.world,
      thanos.maxHp,
      playerDamageSourceId(runtime),
    );

    const pickup = findPickupAt(runtime, thanos.x, thanos.y);
    const dropCount =
      pickup.contents.countType("item:thanos_fist" as ResourceId) +
      pickup.contents.countType("item:thanos_rifle" as ResourceId) +
      pickup.contents.countType("item:thanos_rocket_launcher" as ResourceId);
    expect(dropCount).toBe(1);
  });

  test("Wither drops fixed hunk loot instead of a player weapon", () => {
    const { runtime } = makeRuntime();
    const wither = new Wither(runtime.world.allocEntityId());
    wither.x = runtime.world.gameConfig.worldSize.w / 2;
    wither.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(wither);

    wither.applyDamage(
      runtime.world,
      wither.maxHp,
      playerDamageSourceId(runtime),
    );

    const fixedHunks = getEntityContent("enemy:wither" as ResourceId)?.deathLoot
      ?.fixedHunks;
    if (fixedHunks === undefined) {
      throw new Error("expected Wither fixed hunk loot content");
    }
    const pickup = findPickupAt(runtime, wither.x, wither.y);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(
      fixedHunks,
    );
    expect(pickup.contents.countType("item:streaker" as ResourceId)).toBe(0);
    expect(pickup.contents.countType("mag:streaker" as ResourceId)).toBe(0);
  });

  test("tripwire targets players once with bleed, slow, and confusion", () => {
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x, y);
    const tripwire = new TripwireStructure(runtime.world.allocEntityId());
    tripwire.x = x;
    tripwire.y = y;
    runtime.world.spawn(tripwire);

    expect(tripwire.typeId).toBe("structure:tripwire");
    expect(tripwire.maxHp).toBe(0);

    tick(runtime, 1);

    expect(runtime.world.entities.has(tripwire.id)).toBe(false);
    expect(player.activeEffects.map((effect) => effect.typeId)).toEqual(
      expect.arrayContaining([
        "effect:bleeding",
        "effect:fractured",
        "effect:confusion",
      ]),
    );
  });

  test("vertical tripwire uses its vertical trigger hitbox", () => {
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x, y + 80);
    const tripwire = new TripwireStructure(runtime.world.allocEntityId());
    tripwire.x = x;
    tripwire.y = y;
    tripwire.setHitboxProfileRects("default", [
      { width: 16, height: 220, offsetX: 0, offsetY: 0 },
    ]);
    runtime.world.spawn(tripwire);

    tick(runtime, 1);

    expect(runtime.world.entities.has(tripwire.id)).toBe(false);
    expect(player.activeEffects.map((effect) => effect.typeId)).toContain(
      "effect:bleeding",
    );
  });

  test("tripwire is not a building fallback target for enemies", () => {
    const { runtime } = makeRuntime();
    for (const entity of runtime.world.entities.all()) {
      runtime.world.despawn(entity.id);
    }
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const tripwire = new TripwireStructure(runtime.world.allocEntityId());
    tripwire.x = x;
    tripwire.y = y;
    const wallbreaker = new Wallbreaker(runtime.world.allocEntityId());
    wallbreaker.x = x + 100;
    wallbreaker.y = y;
    runtime.world.spawn(tripwire);
    runtime.world.spawn(wallbreaker);

    tick(runtime, 1);

    expect(wallbreaker.targetId).toBeUndefined();
  });

  test("breaking a reward crate drops its contents as a pickup", () => {
    const { runtime } = makeRuntime();
    const crate = new CrateStructure(runtime.world.allocEntityId());
    crate.x = runtime.world.gameConfig.worldSize.w / 2;
    crate.y = runtime.world.gameConfig.worldSize.h / 2;
    crate.contents.addStackable("item:hunk" as ResourceId, 12);
    runtime.world.spawn(crate);

    expect(crate.typeId).toBe("structure:crate");
    crate.applyDamage(runtime.world, 1, playerDamageSourceId(runtime));
    expect(crate.alive).toBe(false);
    expect(runtime.world.entities.has(crate.id)).toBe(false);
    const pickup = findPickupAt(runtime, crate.x, crate.y);
    expect(pickup).toBeInstanceOf(ItemEntity);
    expect(pickup.id).not.toBe(crate.id);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(12);
    expect(runtime.world.events.at(-1)).toMatchObject({
      type: "damage",
      payload: {
        targetId: crate.id,
        targetTypeId: "structure:crate",
        isFatal: true,
      },
    });
  });

  test("reward crates stay inert enemy loot containers", () => {
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    spawnPlayerLikeDynamic(runtime, x + 80, y);
    const crate = new CrateStructure(runtime.world.allocEntityId());
    crate.x = x;
    crate.y = y;
    runtime.world.spawn(crate);

    tick(runtime, 30);

    expect(crate.typeId).toBe("structure:crate");
    expect(crate.targetId).toBeUndefined();
    expect(crate.x).toBe(x);
    expect(crate.y).toBe(y);
  });

  test("player melee can break a reward crate and drop its contents", () => {
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x - 45, y);
    const crate = new CrateStructure(runtime.world.allocEntityId());
    crate.x = x;
    crate.y = y;
    crate.contents.addStackable("item:hunk" as ResourceId, 12);
    runtime.world.spawn(crate);
    runtime.world.ensureSpatialIndex();

    expect(new Fists().hit(runtime.world, player, 0)).toBe(true);
    expect(crate.alive).toBe(false);
    const pickup = findPickupAt(runtime, crate.x, crate.y);
    expect(pickup).toBeInstanceOf(ItemEntity);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(12);
  });
});

function simulateWaveAndFirstDeathDrop(seed: number): {
  firstWaveEnemyX: number;
  firstWaveEnemyY: number;
  hunk: number;
  ammo: number;
  weapon: number;
} {
  const { runtime } = makeRuntime({ worldSeed: seed });
  tick(runtime, 1);
  const waveEnemy = runtime.world.entities
    .all()
    .find((entity) => entity instanceof Shoota && entity.id > 1);
  if (!(waveEnemy instanceof Shoota)) {
    throw new Error("expected first wave shoota spawn");
  }
  waveEnemy.applyDamage(
    runtime.world,
    waveEnemy.maxHp * 4,
    playerDamageSourceId(runtime),
  );
  const pickup = findPickupAt(runtime, waveEnemy.x, waveEnemy.y);
  return {
    firstWaveEnemyX: waveEnemy.x,
    firstWaveEnemyY: waveEnemy.y,
    hunk: pickup.contents.countType("item:hunk" as ResourceId),
    ammo: pickup.contents.countType("mag:basic_gun" as ResourceId),
    weapon: pickup.contents.countType("item:basic_gun" as ResourceId),
  };
}

function findPickupAt(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  x: number,
  y: number,
): ItemEntity {
  const pickup = runtime.world.entities
    .all()
    .find(
      (entity): entity is ItemEntity =>
        entity instanceof ItemEntity && entity.x === x && entity.y === y,
    );
  if (!pickup) {
    throw new Error("expected dropped pickup");
  }
  return pickup;
}

function rangeInclusive(min: number, max: number): number[] {
  const values: number[] = [];
  for (let value = min; value <= max; value += 1) {
    values.push(value);
  }
  return values;
}

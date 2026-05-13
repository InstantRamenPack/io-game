import { afterEach, describe, expect, test } from "bun:test";
import { Crate } from "@server/entities/enemies/Crate.ts";
import { DungeonDoor } from "@server/entities/buildings/DungeonDoor.ts";
import { Tripwire } from "@server/entities/buildings/Tripwire.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const DUNGEON_KEY_TYPE_ID = "item:dungeon_key" as ResourceId;

describe("dungeon runtime mechanics", () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  test("enemy death drops hunks, matching ammo, and sometimes the carried weapon", () => {
    bootstrapTestRegistries();
    Math.random = () => 0.01;
    const { runtime } = makeRuntime();
    const enemy = new Shoota(runtime.world.allocEntityId());
    enemy.x = runtime.world.gameConfig.worldSize.w / 2;
    enemy.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(enemy);

    enemy.applyDamage(runtime.world, enemy.maxHp, 0);

    const pickup = findPickupAt(runtime, enemy.x, enemy.y);
    expect(
      pickup.contents.countType("item:hunk" as ResourceId),
    ).toBe(3);
    expect(
      pickup.contents.countType("item:pistol_mag" as ResourceId),
    ).toBeGreaterThan(0);
    expect(
      pickup.contents.countType("item:basic_gun" as ResourceId),
    ).toBeGreaterThan(0);
  });

  test("enemy death uses the upgraded carried weapon drop chance", () => {
    bootstrapTestRegistries();
    Math.random = () => 0.2;
    const { runtime } = makeRuntime();
    const enemy = new Shoota(runtime.world.allocEntityId());
    enemy.x = runtime.world.gameConfig.worldSize.w / 2;
    enemy.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(enemy);

    enemy.applyDamage(runtime.world, enemy.maxHp, 0);

    const pickup = findPickupAt(runtime, enemy.x, enemy.y);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(3);
    expect(
      pickup.contents.countType("item:basic_gun" as ResourceId),
    ).toBeGreaterThan(0);
  });

  test("same-tick multi-kill loot does not reuse dead enemy ids", () => {
    bootstrapTestRegistries();
    Math.random = () => 0.5;
    const { runtime } = makeRuntime();
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

    firstEnemy.applyDamage(runtime.world, firstEnemy.maxHp, 0);
    secondEnemy.applyDamage(runtime.world, secondEnemy.maxHp, 0);

    const pickups = runtime.world.entities
      .all()
      .filter((entity): entity is ItemEntity => entity instanceof ItemEntity);
    expect(pickups).toHaveLength(2);
    for (const pickup of pickups) {
      expect(deadEnemyIds.has(pickup.id)).toBe(false);
    }
  });

  test("Thanos drops his carried weapons on death", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const thanos = new Thanos(runtime.world.allocEntityId());
    thanos.x = runtime.world.gameConfig.worldSize.w / 2;
    thanos.y = runtime.world.gameConfig.worldSize.h / 2;
    runtime.world.spawn(thanos);

    thanos.applyDamage(runtime.world, thanos.maxHp, 0);

    const pickup = findPickupAt(runtime, thanos.x, thanos.y);
    expect(
      pickup.contents.countType("item:thanos_fist" as ResourceId),
    ).toBeGreaterThan(0);
    expect(
      pickup.contents.countType("item:thanos_rifle" as ResourceId),
    ).toBeGreaterThan(0);
    expect(
      pickup.contents.countType("item:thanos_rocket_launcher" as ResourceId),
    ).toBeGreaterThan(0);
  });

  test("tripwire targets players once with bleed, slow, and confusion", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x, y);
    const tripwire = new Tripwire(runtime.world.allocEntityId());
    tripwire.x = x;
    tripwire.y = y;
    runtime.world.spawn(tripwire);

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

  test("dungeon door consumes a key and opens when a player reaches it", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x, y);
    player.inventory.addStackable(DUNGEON_KEY_TYPE_ID, 1);
    const door = new DungeonDoor(runtime.world.allocEntityId());
    door.x = x + 24;
    door.y = y;
    runtime.world.spawn(door);

    tick(runtime, 1);

    expect(runtime.world.entities.has(door.id)).toBe(false);
    expect(player.inventory.countType(DUNGEON_KEY_TYPE_ID)).toBe(0);
  });

  test("breaking a reward crate drops its contents as a pickup", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const crate = new Crate(runtime.world.allocEntityId());
    crate.x = runtime.world.gameConfig.worldSize.w / 2;
    crate.y = runtime.world.gameConfig.worldSize.h / 2;
    crate.contents.addStackable("item:hunk" as ResourceId, 12);
    runtime.world.spawn(crate);

    expect(crate.typeId).toBe("enemy:crate");
    expect(crate.maxHp).toBe(50);

    crate.applyDamage(runtime.world, 49, 0);
    expect(crate.alive).toBe(true);
    expect(runtime.world.entities.has(crate.id)).toBe(true);

    crate.applyDamage(runtime.world, 1, 0);

    expect(crate.alive).toBe(false);
    expect(runtime.world.entities.has(crate.id)).toBe(false);
    const pickup = findPickupAt(runtime, crate.x, crate.y);
    expect(pickup).toBeInstanceOf(ItemEntity);
    expect(pickup.id).not.toBe(crate.id);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(12);
    expect(runtime.world.events.peekBack()).toMatchObject({
      type: "damage",
      payload: {
        targetId: crate.id,
        targetTypeId: "enemy:crate",
        isFatal: true,
      },
    });
  });

  test("player melee can break a reward crate and drop its contents", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x - 45, y);
    const crate = new Crate(runtime.world.allocEntityId());
    crate.x = x;
    crate.y = y;
    crate.contents.addStackable("item:hunk" as ResourceId, 12);
    runtime.world.spawn(crate);
    runtime.world.ensureSpatialIndex();

    for (let hitCount = 0; hitCount < 8 && crate.alive; hitCount += 1) {
      expect(new Fists().hit(runtime.world, player, 0)).toBe(true);
      runtime.world.ensureSpatialIndex();
    }

    expect(crate.alive).toBe(false);
    const pickup = findPickupAt(runtime, crate.x, crate.y);
    expect(pickup).toBeInstanceOf(ItemEntity);
    expect(pickup.contents.countType("item:hunk" as ResourceId)).toBe(12);
  });
});

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

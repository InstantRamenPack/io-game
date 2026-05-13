import { beforeAll, describe, expect, test } from "bun:test";
import { Dungeon } from "@server/entities/structures/Dungeon.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
} from "@tests/helpers/worldFixtures.ts";

describe("melee occlusion", () => {
  beforeAll(bootstrapTestRegistries);

  test("multi-rect static blockers only occlude with their actual rects", () => {
    const { runtime } = makeRuntime();
    const owner = spawnPlayerLikeDynamic(runtime, 100, 100);
    const target = spawnEnemy(runtime, "drifter", 130, 100);
    const dungeon = new Dungeon(runtime.world.allocEntityId());
    dungeon.x = 120;
    dungeon.y = 100;
    dungeon.setHitboxProfileRects("default", [
      { offsetX: 0, offsetY: -80, width: 20, height: 20 },
      { offsetX: 0, offsetY: 80, width: 20, height: 20 },
    ]);
    runtime.world.spawn(dungeon);
    runtime.world.ensureSpatialIndex();

    const beforeHp = target.hp;

    expect(new Fists().hit(runtime.world, owner, 0)).toBe(true);
    expect(target.hp).toBeLessThan(beforeHp);
  });

  test("multi-rect static blockers still occlude intersecting rects", () => {
    const { runtime } = makeRuntime();
    const owner = spawnPlayerLikeDynamic(runtime, 100, 100);
    const target = spawnEnemy(runtime, "drifter", 140, 100);
    const dungeon = new Dungeon(runtime.world.allocEntityId());
    dungeon.x = 120;
    dungeon.y = 100;
    dungeon.setHitboxProfileRects("default", [
      { offsetX: 0, offsetY: 0, width: 20, height: 20 },
      { offsetX: 0, offsetY: 80, width: 20, height: 20 },
    ]);
    runtime.world.spawn(dungeon);
    runtime.world.ensureSpatialIndex();

    const beforeHp = target.hp;

    expect(new Fists().hit(runtime.world, owner, 0)).toBe(true);
    expect(target.hp).toBe(beforeHp);
  });
});

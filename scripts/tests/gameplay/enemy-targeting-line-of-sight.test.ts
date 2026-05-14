import { beforeAll, describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  spawnWall,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("enemy target line of sight", () => {
  beforeAll(bootstrapTestRegistries);

  test("enemy locks onto player when line of sight is clear", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const enemy = spawnEnemy(runtime, "police", 260, 100) as Enemy;

    tick(runtime, 1);

    expect(enemy.targetId).toBe(player.id);
  });

  test("enemy does not lock onto player behind static structure", () => {
    const { runtime } = makeRuntime();
    spawnPlayerLikeDynamic(runtime, 100, 100);
    const enemy = spawnEnemy(runtime, "police", 260, 100) as Enemy;
    spawnWall(runtime, 180, 100);

    tick(runtime, 1);

    expect(enemy.targetId).toBeUndefined();
  });

  test("enemy keeps existing player lock when structure blocks sight", () => {
    const { runtime } = makeRuntime({ config: { tickRate: 10 } });
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const enemy = spawnEnemy(runtime, "police", 260, 100) as Enemy;
    enemy.moveSpeed = 0;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    spawnWall(runtime, 180, 100);
    tick(runtime, 10 * 19);

    expect(enemy.targetId).toBe(player.id);
  });

  test("enemy drops existing player lock when target leaves aggro radius", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const enemy = spawnEnemy(runtime, "police", 260, 100) as Enemy;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    player.x = 1000;
    tick(runtime, 1);

    expect(enemy.targetId).toBeUndefined();
  });

  test("enemy drops existing player lock after twenty seconds without line of sight", () => {
    const { runtime } = makeRuntime({ config: { tickRate: 10 } });
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const enemy = spawnEnemy(runtime, "police", 260, 100) as Enemy;
    enemy.moveSpeed = 0;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    spawnWall(runtime, 180, 100);
    tick(runtime, 10 * 20);

    expect(enemy.targetId).toBeUndefined();
  });
});

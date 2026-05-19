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

  const playerStart = { x: 6000, y: 500 };
  const enemyStart = { x: 6160, y: 500 };
  const wallStart = { x: 6080, y: 500 };
  const outsideAggro = { x: 7000, y: 1400 };

  test("enemy locks onto player when line of sight is clear", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(
      runtime,
      playerStart.x,
      playerStart.y,
    );
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;

    tick(runtime, 1);

    expect(enemy.targetId).toBe(player.id);
  });

  test("enemy does not lock onto player behind static structure", () => {
    const { runtime } = makeRuntime();
    spawnPlayerLikeDynamic(runtime, playerStart.x, playerStart.y);
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;
    spawnWall(runtime, wallStart.x, wallStart.y);

    tick(runtime, 1);

    expect(enemy.targetId).toBeUndefined();
  });

  test("enemy keeps existing player lock when structure blocks sight for under one hundred ticks", () => {
    const { runtime } = makeRuntime({ config: { tickRate: 10 } });
    const player = spawnPlayerLikeDynamic(
      runtime,
      playerStart.x,
      playerStart.y,
    );
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;
    enemy.moveSpeed = 0;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    spawnWall(runtime, wallStart.x, wallStart.y);
    tick(runtime, 99);

    expect(enemy.targetId).toBe(player.id);
  });

  test("enemy drops existing player lock when target leaves aggro radius", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(
      runtime,
      playerStart.x,
      playerStart.y,
    );
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    player.x = outsideAggro.x;
    player.y = outsideAggro.y;
    tick(runtime, 1);

    expect(enemy.targetId).toBeUndefined();
  });

  test("enemy drops existing player lock after one hundred ticks without line of sight", () => {
    const { runtime } = makeRuntime({ config: { tickRate: 10 } });
    const player = spawnPlayerLikeDynamic(
      runtime,
      playerStart.x,
      playerStart.y,
    );
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;
    enemy.moveSpeed = 0;

    tick(runtime, 1);
    expect(enemy.targetId).toBe(player.id);

    spawnWall(runtime, wallStart.x, wallStart.y);
    tick(runtime, 100);

    expect(enemy.targetId).toBeUndefined();
  });
});

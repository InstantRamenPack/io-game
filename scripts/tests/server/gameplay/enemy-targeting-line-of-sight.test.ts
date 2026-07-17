import { beforeAll, describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Hub } from "@server/entities/tower/Hub.ts";
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

  test("drifter prefers a visible player before falling back to a nearer building", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 6500, 500);
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = 6100;
    hub.y = 500;
    runtime.world.spawn(hub);
    const enemy = spawnEnemy(runtime, "drifter", 6150, 500) as Enemy;

    tick(runtime, 1);

    expect(enemy.targetId).toBe(player.id);
  });

  test("wave enemy falls back to a nearer building after its player despawns", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 6500, 500);
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = 6150;
    hub.y = 700;
    runtime.world.spawn(hub);
    const enemy = spawnEnemy(runtime, "police", 6100, 500) as Enemy;
    enemy.spawnSource = "wave";

    tick(runtime, 1);

    expect(enemy.targetId).toBe(player.id);

    player.alive = false;
    runtime.world.despawn(player.id);
    tick(runtime, 1);

    expect(enemy.targetId).toBe(hub.id);
  });

  test("wave enemy uses finite player-first aggro before falling back to buildings", () => {
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 6500, 500);
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = 6150;
    hub.y = 700;
    runtime.world.spawn(hub);
    const enemy = spawnEnemy(runtime, "police", 6100, 500) as Enemy;
    enemy.spawnSource = "wave";

    tick(runtime, 1);

    expect(enemy.targetId).toBe(player.id);

    player.x = 7600;
    player.y = 500;
    tick(runtime, 1);

    expect(enemy.targetId).toBe(hub.id);
  });

  test("enemy targets blocking building when player is hidden behind it", () => {
    const { runtime } = makeRuntime();
    spawnPlayerLikeDynamic(runtime, playerStart.x, playerStart.y);
    const enemy = spawnEnemy(
      runtime,
      "police",
      enemyStart.x,
      enemyStart.y,
    ) as Enemy;
    const wall = spawnWall(runtime, wallStart.x, wallStart.y);

    tick(runtime, 1);

    expect(enemy.targetId).toBe(wall.id);
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

    const wall = spawnWall(runtime, wallStart.x, wallStart.y);
    tick(runtime, 100);

    expect(enemy.targetId).toBe(wall.id);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import type { Enemy } from "@server/entities/Enemy.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("enemy wandering", () => {
  beforeAll(bootstrapTestRegistries);

  const playerStart = { x: 6000, y: 500 };
  const enemyStart = { x: 6160, y: 500 };
  const outsideAggro = { x: 7000, y: 1400 };

  test("enemy without aggro wanders near its idle anchor", () => {
    const { runtime } = makeRuntime();
    const enemy = spawnEnemy(runtime, "police", 300, 300) as Enemy;
    const anchor = { x: enemy.x, y: enemy.y };

    tick(runtime, 260);

    const distanceFromAnchor = Math.hypot(
      enemy.x - anchor.x,
      enemy.y - anchor.y,
    );
    expect(distanceFromAnchor).toBeGreaterThan(5);
    expect(distanceFromAnchor).toBeLessThanOrEqual(170);
    expect(enemy.targetId).toBeUndefined();
  });

  test("enemy starts wandering around its standing point after losing aggro", () => {
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

    const idleAnchor = { x: enemy.x, y: enemy.y };
    tick(runtime, 260);

    const distanceFromIdleAnchor = Math.hypot(
      enemy.x - idleAnchor.x,
      enemy.y - idleAnchor.y,
    );
    expect(distanceFromIdleAnchor).toBeGreaterThan(5);
    expect(distanceFromIdleAnchor).toBeLessThanOrEqual(170);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { Enemy } from "@server/entities/Enemy.ts";
import { refreshLayoutEnemies } from "@server/systems/MapLoader.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("layout enemy dawn respawn", () => {
  beforeAll(bootstrapTestRegistries);

  test("refreshLayoutEnemies restores killed layout enemies only", () => {
    const { runtime } = makeRuntime({ worldSeed: 42 });
    const layoutEnemiesBefore = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(layoutEnemiesBefore.length).toBeGreaterThan(0);

    const killed = layoutEnemiesBefore[0]!;
    killed.hp = 0;
    killed.alive = false;
    runtime.world.despawn(killed.id);
    tick(runtime, 1);

    const remainingLayout = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(remainingLayout.length).toBe(layoutEnemiesBefore.length - 1);

    refreshLayoutEnemies(runtime.world);
    tick(runtime, 1);

    const restoredLayout = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(restoredLayout.length).toBe(layoutEnemiesBefore.length);
  });
});

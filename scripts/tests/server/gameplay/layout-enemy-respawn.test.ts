import { beforeAll, describe, expect, test } from "bun:test";
import { Crate } from "@server/entities/enemies/Crate.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import {
  refreshLayoutEnemies,
  refreshLoot,
} from "@server/systems/MapLoader.ts";
import { isLegendaryBossTypeId } from "@shared/world/legendaryBoss.ts";
import { getSectorForPoint } from "@shared/world/ProceduralWorld.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

function countRegularLayoutEnemies(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
): number {
  const layout = runtime.world.proceduralLayout;
  if (!layout) {
    return 0;
  }
  return runtime.world.entities.all().filter((entity) => {
    if (!(entity instanceof Enemy)) {
      return false;
    }
    if (entity.spawnSource !== "layout") {
      return false;
    }
    if (entity.typeId === "enemy:crate") {
      return false;
    }
    const sector = getSectorForPoint(layout, entity);
    return sector?.archetype !== "dungeon";
  }).length;
}

describe("layout enemy dawn respawn", () => {
  beforeAll(bootstrapTestRegistries);

  test("refreshLayoutEnemies restores half of killed regular layout enemies only", () => {
    const { runtime } = makeRuntime({ worldSeed: 42 });
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    const eligibleRespawnSpecs = layout.sectors.flatMap((sector) =>
      sector.archetype === "dungeon"
        ? []
        : sector.enemies.filter(
            (spec) =>
              spec.typeId !== "enemy:crate" &&
              !(
                sector.archetype === "extraction" &&
                isLegendaryBossTypeId(spec.typeId)
              ),
          ),
    );
    const dungeonSpecKeys = new Set(
      layout.sectors
        .filter((sector) => sector.archetype === "dungeon")
        .flatMap((sector) => sector.enemies)
        .map((spec) => `${spec.typeId}@${spec.x},${spec.y}`),
    );

    const layoutEnemiesBefore = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(layoutEnemiesBefore.length).toBeGreaterThan(
      eligibleRespawnSpecs.length,
    );

    for (const enemy of layoutEnemiesBefore) {
      enemy.hp = 0;
      enemy.alive = false;
      runtime.world.despawn(enemy.id);
    }
    tick(runtime, 1);

    const remainingLayout = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(remainingLayout.length).toBe(0);

    refreshLayoutEnemies(runtime.world);
    tick(runtime, 1);

    const restoredLayout = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "layout",
      );
    expect(restoredLayout).toHaveLength(
      Math.floor(eligibleRespawnSpecs.length * 0.5),
    );
    expect(restoredLayout.some((entity) => entity instanceof Crate)).toBe(
      false,
    );
    expect(
      restoredLayout.some((entity) =>
        dungeonSpecKeys.has(`${entity.typeId}@${entity.x},${entity.y}`),
      ),
    ).toBe(false);
  });

  test("refreshLoot leaves destroyed crates gone so dawn does not refill loot", () => {
    const { runtime } = makeRuntime({ worldSeed: 42 });
    const cratesBefore = runtime.world.entities
      .all()
      .filter((entity): entity is Crate => entity instanceof Crate);
    expect(cratesBefore.length).toBeGreaterThan(0);

    for (const crate of cratesBefore) {
      crate.hp = 0;
      crate.alive = false;
      runtime.world.despawn(crate.id);
    }
    tick(runtime, 1);
    expect(
      runtime.world.entities
        .all()
        .filter((entity): entity is Crate => entity instanceof Crate),
    ).toHaveLength(0);

    refreshLoot(runtime.world);
    tick(runtime, 1);

    expect(
      runtime.world.entities
        .all()
        .filter((entity): entity is Crate => entity instanceof Crate),
    ).toHaveLength(0);
  });

  test("refreshLayoutEnemies keeps surviving regular layout enemies in place", () => {
    const { runtime } = makeRuntime({ worldSeed: 42 });
    const regularBefore = countRegularLayoutEnemies(runtime);
    expect(regularBefore).toBeGreaterThan(0);

    const survivorId = runtime.world.entities
      .all()
      .find(
        (entity): entity is Enemy =>
          entity instanceof Enemy &&
          entity.spawnSource === "layout" &&
          entity.typeId !== "enemy:crate",
      )?.id;
    expect(survivorId).toBeDefined();

    refreshLayoutEnemies(runtime.world);
    tick(runtime, 1);

    expect(runtime.world.entities.has(survivorId!)).toBe(true);
    expect(countRegularLayoutEnemies(runtime)).toBe(regularBefore);
  });

  test("refreshLayoutEnemies leaves surviving crates and dungeon enemies in place", () => {
    const { runtime } = makeRuntime({ worldSeed: 42 });
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    const dungeonSpecKeys = new Set(
      layout.sectors
        .filter((sector) => sector.archetype === "dungeon")
        .flatMap((sector) => sector.enemies)
        .map((spec) => `${spec.typeId}@${spec.x},${spec.y}`),
    );
    const crate = runtime.world.entities
      .all()
      .find((entity): entity is Crate => entity instanceof Crate);
    const dungeonEnemy = runtime.world.entities
      .all()
      .find(
        (entity): entity is Enemy =>
          entity instanceof Enemy &&
          dungeonSpecKeys.has(`${entity.typeId}@${entity.x},${entity.y}`),
      );
    expect(crate).toBeDefined();
    expect(dungeonEnemy).toBeDefined();
    if (!crate || !dungeonEnemy) {
      throw new Error("expected a crate and dungeon enemy");
    }

    refreshLayoutEnemies(runtime.world);
    tick(runtime, 1);

    expect(runtime.world.entities.has(crate.id)).toBe(true);
    expect(runtime.world.entities.has(dungeonEnemy.id)).toBe(true);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { Entity } from "@server/entities/Entity.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { NavGridPathService } from "@server/world/NavGridPathService.ts";
import { StaticGeometryIndex } from "@server/world/StaticGeometryIndex.ts";
import type { World } from "@server/world/World.ts";

class TestBlocker extends Entity {
  public static readonly kind = "structure" as const;
  public static override readonly resourceName = "base";

  constructor(id: number, tileX: number, tileY: number) {
    super(id, { maxHp: 1 });
    this.collisionMode = "static";
    this.setHitboxProfileRects("default", [
      { width: 16, height: 16, offsetX: 0, offsetY: 0 },
    ]);
    this.x = tileX * 16 + 8;
    this.y = tileY * 16 + 8;
  }

  public override tick(): void {}
}

describe("navigation path cache", () => {
  beforeAll(bootstrapTypeRegistries);

  test("failed routes are bounded retries and reopen immediately after geometry changes", () => {
    const service = new NavGridPathService({ w: 128, h: 128 });
    const staticGeometry = new StaticGeometryIndex(16);
    const world = { staticGeometry, tick: 1 } as World;
    const wall = Array.from(
      { length: 8 },
      (_, y) => new TestBlocker(y + 1, 3, y),
    );
    staticGeometry.sync(wall);
    service.updateDirty(world);
    service.benchmarkEnabled = true;
    for (let i = 0; i < 20; i++)
      expect(service.getNextWaypoint(24, 24, 104, 104)).toBeNull();
    expect(service.collectAndResetBenchmarkStats()).toMatchObject({
      pathSearches: 1,
      cacheHits: 19,
    });
    world.tick += 10;
    service.updateDirty(world);
    expect(service.getNextWaypoint(24, 24, 104, 104)).toBeNull();
    expect(service.collectAndResetBenchmarkStats().pathSearches).toBe(1);
    staticGeometry.removeEntity(wall[3]!.id);
    service.markEntityDirty(wall[3]!);
    service.updateDirty(world);
    expect(service.getNextWaypoint(24, 24, 104, 104)).not.toBeNull();
  });

  test("invalidates a cached diagonal path when a corner tile becomes blocked", () => {
    const service = new NavGridPathService({ w: 128, h: 128 });
    const staticGeometry = new StaticGeometryIndex(16);
    const world = { staticGeometry } as World;
    const centerBlocker = new TestBlocker(1, 3, 3);
    staticGeometry.sync([centerBlocker]);
    service.updateDirty(world);
    service.benchmarkEnabled = true;

    expect(service.getNextWaypoint(24, 24, 104, 104)).not.toBeNull();
    expect(service.collectAndResetBenchmarkStats().pathSearches).toBe(1);

    const cachedPaths = (
      service as unknown as {
        pathCache: Map<number, { points: readonly { x: number; y: number }[] }>;
      }
    ).pathCache;
    const path = cachedPaths.values().next().value?.points;
    expect(path).toBeDefined();

    const pathTiles = new Set(path?.map(({ x, y }) => `${x},${y}`));
    let dependency: { x: number; y: number } | undefined;
    for (let index = 1; path && index < path.length; index += 1) {
      const previous = path[index - 1];
      const point = path[index];
      if (
        !previous ||
        !point ||
        previous.x === point.x ||
        previous.y === point.y
      ) {
        continue;
      }
      dependency = [
        { x: point.x, y: previous.y },
        { x: previous.x, y: point.y },
      ].find(({ x, y }) => !pathTiles.has(`${x},${y}`));
      if (dependency) {
        break;
      }
    }
    expect(dependency).toBeDefined();
    if (!dependency) {
      throw new Error("expected a diagonal path dependency tile");
    }

    const cornerBlocker = new TestBlocker(2, dependency.x, dependency.y);
    staticGeometry.sync([centerBlocker, cornerBlocker]);
    service.markEntityDirty(cornerBlocker);
    service.updateDirty(world);

    expect(service.getNextWaypoint(24, 24, 104, 104)).not.toBeNull();
    expect(service.collectAndResetBenchmarkStats()).toMatchObject({
      cacheHits: 0,
      pathSearches: 1,
    });
  });
});

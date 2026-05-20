import { beforeAll, describe, expect, test } from "bun:test";
import { SpatialIndex } from "@server/world/SpatialIndex.ts";
import { Entity } from "@server/entities/Entity.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";

class TestEntity extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  constructor(id: number, x: number, y: number, size = 10) {
    super(id, { maxHp: 1 });
    this.collisionMode = "dynamic";
    this.setHitboxProfileRects("default", [
      { width: size, height: size, offsetX: 0, offsetY: 0 },
    ]);
    this.x = x;
    this.y = y;
  }

  public override tick(): void {}
}

describe("spatial index", () => {
  beforeAll(bootstrapTypeRegistries);

  test("entity in one cell queried", () => {
    const index = new SpatialIndex(20);
    const entity = new TestEntity(1, 5, 5, 6);
    index.sync([entity]);
    const result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(entity);
  });

  test("entity spanning multiple cells returned once", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 15, 15, 30);
    index.sync([entity]);
    const result = index.queryBox(0, 0, 40, 40);
    expect(result).toHaveLength(1);
  });

  test("query empty region returns empty", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 15, 15, 10);
    index.sync([entity]);
    const result = index.queryBox(100, 100, 120, 120);
    expect(result).toHaveLength(0);
  });

  test("moved entity updates buckets after sync", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 5, 5, 8);
    index.sync([entity]);
    let result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(1);
    entity.x = 50;
    entity.y = 50;
    index.sync([entity]);
    result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(0);
    result = index.queryBox(40, 40, 60, 60);
    expect(result).toHaveLength(1);
  });

  test("removed entity after sync is absent", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 5, 5, 8);
    index.sync([entity]);
    index.sync([]);
    const result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(0);
  });

  test("reused output buffer cleared correctly", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 5, 5, 8);
    const buffer: Entity[] = [entity];
    index.sync([entity]);
    const result = index.queryBox(100, 100, 120, 120, buffer);
    expect(result).toHaveLength(0);
  });

  test("exact cell edge stable", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 10, 10, 10);
    index.sync([entity]);
    const result = index.queryBox(10, 10, 20, 20);
    expect(result).toHaveLength(1);
  });

  test("negative coordinate has no key collision", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, -15, -15, 8);
    index.sync([entity]);
    const result = index.queryBox(-20, -20, -5, -5);
    expect(result).toHaveLength(1);
  });

  test("huge coordinate within world is stable", () => {
    const index = new SpatialIndex(10);
    const entity = new TestEntity(1, 100000, 100000, 8);
    index.sync([entity]);
    const result = index.queryBox(99990, 99990, 100010, 100010);
    expect(result).toHaveLength(1);
  });

  test("sync marker rollover simulated", () => {
    const index = new SpatialIndex(10);
    (index as unknown as { syncMarker: number }).syncMarker =
      Number.MAX_SAFE_INTEGER - 1;
    const entity = new TestEntity(1, 5, 5, 8);
    index.sync([entity]);
    const result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(1);
  });

  test("query marker rollover simulated", () => {
    const index = new SpatialIndex(10);
    (index as unknown as { queryMarker: number }).queryMarker =
      Number.MAX_SAFE_INTEGER - 1;
    const entity = new TestEntity(1, 5, 5, 8);
    index.sync([entity]);
    const result = index.queryBox(0, 0, 10, 10);
    expect(result).toHaveLength(1);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { StaticGeometryIndex } from "@server/world/StaticGeometryIndex.ts";
import { Entity } from "@server/entities/Entity.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";

class TestEntity extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  constructor(id: number, x: number, y: number, mode: "static" | "dynamic") {
    super(id, { maxHp: 1 });
    this.collisionMode = mode;
    this.setHitboxProfileRects("default", [
      { width: 10, height: 10, offsetX: 0, offsetY: 0 },
    ]);
    this.x = x;
    this.y = y;
  }

  public override tick(): void {}
}

describe("static geometry index", () => {
  beforeAll(bootstrapTypeRegistries);

  test("static-only entities indexed", () => {
    const index = new StaticGeometryIndex(10);
    const staticEntity = new TestEntity(1, 10, 10, "static");
    const dynamicEntity = new TestEntity(2, 10, 10, "dynamic");
    index.sync([staticEntity, dynamicEntity]);
    const result = index.queryBox(0, 0, 20, 20);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe(staticEntity.id);
  });

  test("dynamic entities excluded", () => {
    const index = new StaticGeometryIndex(10);
    const dynamicEntity = new TestEntity(1, 10, 10, "dynamic");
    index.sync([dynamicEntity]);
    const result = index.queryBox(0, 0, 20, 20);
    expect(result).toHaveLength(0);
  });

  test("collisionMode changes update index", () => {
    const index = new StaticGeometryIndex(10);
    const entity = new TestEntity(1, 10, 10, "static");
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(1);
    entity.collisionMode = "dynamic";
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(0);
    entity.collisionMode = "static";
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(1);
  });

  test("despawn removes blockers", () => {
    const index = new StaticGeometryIndex(10);
    const entity = new TestEntity(1, 10, 10, "static");
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(1);
    entity.alive = false;
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(0);
  });

  test("query returns blockers once", () => {
    const index = new StaticGeometryIndex(10);
    const entity = new TestEntity(1, 15, 15, "static");
    entity.setHitboxProfileRects("default", [
      { width: 30, height: 30, offsetX: 0, offsetY: 0 },
    ]);
    index.sync([entity]);
    const result = index.queryBox(0, 0, 40, 40);
    expect(result).toHaveLength(1);
  });

  test("hitbox position changes reflected after sync", () => {
    const index = new StaticGeometryIndex(10);
    const entity = new TestEntity(1, 10, 10, "static");
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(1);
    entity.x = 50;
    entity.y = 50;
    index.sync([entity]);
    expect(index.queryBox(0, 0, 20, 20)).toHaveLength(0);
    expect(index.queryBox(40, 40, 60, 60)).toHaveLength(1);
  });
});

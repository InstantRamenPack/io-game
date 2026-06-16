import { beforeAll, describe, expect, test } from "bun:test";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { PickupSystem } from "@server/systems/PickupSystem.ts";
import { World } from "@server/world/World.ts";
import {
  bootstrapTestRegistries,
  makeTestConfig,
} from "@tests/helpers/worldFixtures.ts";

describe("pickup system spawning", () => {
  beforeAll(bootstrapTestRegistries);

  test("does not create ambient item pickups after world generation", () => {
    const world = new World(
      makeTestConfig({ worldSize: { w: 1200, h: 1200 } }),
    );
    const system = new PickupSystem();

    system.update(world);

    expect(world.entities.queryInstances(ItemEntity)).toHaveLength(0);
  });
});

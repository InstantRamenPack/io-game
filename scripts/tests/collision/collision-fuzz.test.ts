import { beforeAll, describe, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  makeTestRng,
  rngFloat,
  rngInt,
  rngPick,
} from "../helpers/testRng.ts";
import {
  assertAllEntityPositionsFinite,
  assertNoDynamicEntityOutsideWorld,
  assertNoDynamicStaticOverlap,
} from "../helpers/collisionInvariants.ts";

const ITEM_TYPES = [
  makeResourceId("item", "wall"),
  makeResourceId("item", "landmine"),
  makeResourceId("item", "chest"),
];

describe("collision fuzz", () => {
  beforeAll(bootstrapTypeRegistries);

  test.each(Array.from({ length: 250 }, (_, index) => index + 1))(
    "seed %s",
    (seed) => {
      const rng = makeTestRng(seed);
      const config = new GameConfig();
      config.debug.spawnMultiplier = 0;
      config.worldSize = {
        w: rngInt(rng, 200, 800),
        h: rngInt(rng, 200, 800),
      };
      const world = new World(config);

      const staticCount = rngInt(rng, 5, 25);
      for (let i = 0; i < staticCount; i += 1) {
        const wall = new Wall(world.allocEntityId(), rngInt(rng, 1, 2));
        wall.x = rngFloat(rng, 10, config.worldSize.w - 10);
        wall.y = rngFloat(rng, 10, config.worldSize.h - 10);
        world.spawn(wall);
      }

      const dynamicCount = rngInt(rng, 5, 18);
      for (let i = 0; i < dynamicCount; i += 1) {
        const entity =
          rngInt(rng, 0, 1) === 0
            ? new Player(world.allocEntityId(), `player-${i}`)
            : new Police(world.allocEntityId());
        entity.x = rngFloat(rng, 20, config.worldSize.w - 20);
        entity.y = rngFloat(rng, 20, config.worldSize.h - 20);
        entity.vx = rngFloat(rng, -220, 220);
        entity.vy = rngFloat(rng, -220, 220);
        entity.tick = () => {};
        world.spawn(entity);
      }

      const itemCount = rngInt(rng, 3, 12);
      for (let i = 0; i < itemCount; i += 1) {
        const inventory = new Inventory();
        inventory.addStackable(rngPick(rng, ITEM_TYPES), rngInt(rng, 1, 3));
        const item = new ItemEntity(world.allocEntityId(), inventory);
        item.x = rngFloat(rng, 20, config.worldSize.w - 20);
        item.y = rngFloat(rng, 20, config.worldSize.h - 20);
        item.vx = rngFloat(rng, -120, 120);
        item.vy = rngFloat(rng, -120, 120);
        item.tick = () => {};
        world.spawn(item);
      }

      const expectedCount = world.entities.all().length;
      try {
        for (let tick = 0; tick < 60; tick += 1) {
          world.step();
          assertAllEntityPositionsFinite(world);
          assertNoDynamicEntityOutsideWorld(world);
          assertNoDynamicStaticOverlap(world);
          if (world.entities.all().length !== expectedCount) {
            throw new Error(
              `entity count changed from ${expectedCount} to ${world.entities.all().length}`,
            );
          }
        }
      } catch (error) {
        const details = {
          seed,
          worldSize: config.worldSize,
          staticCount,
          dynamicCount,
          itemCount,
          entityCount: world.entities.all().length,
        };
        throw new Error(
          `collision fuzz failed: ${JSON.stringify(details)}\n${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  );
});

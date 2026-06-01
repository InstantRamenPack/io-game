import { beforeAll, describe, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
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
} from "@tests/helpers/testRng.ts";
import {
  assertAllEntityPositionsFinite,
  assertNoDynamicEntityOutsideWorld,
  assertNoDynamicStaticOverlap,
} from "@tests/helpers/collisionInvariants.ts";

const ITEM_TYPES = [
  makeResourceId("item", "wall"),
  makeResourceId("item", "landmine"),
  makeResourceId("item", "cannon"),
];

function randomVelocity(
  rng: ReturnType<typeof makeTestRng>,
  max: number,
): number {
  const profile = rngInt(rng, 0, 3);
  if (profile === 0) {
    return 0;
  }
  if (profile === 1) {
    return rngFloat(rng, -0.01, 0.01);
  }
  if (profile === 2) {
    return rngFloat(rng, -max * 0.35, max * 0.35);
  }
  return rngFloat(rng, -max, max);
}

function placeEntityWithoutInitialOverlap(
  world: World,
  entity: Entity,
  rng: ReturnType<typeof makeTestRng>,
): boolean {
  const localBounds = entity.getHitboxBounds();
  const minX = -localBounds.minX + 4;
  const maxX = world.gameConfig.worldSize.w - localBounds.maxX - 4;
  const minY = -localBounds.minY + 4;
  const maxY = world.gameConfig.worldSize.h - localBounds.maxY - 4;
  if (minX >= maxX || minY >= maxY) {
    return false;
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    entity.x = rngFloat(rng, minX, maxX);
    entity.y = rngFloat(rng, minY, maxY);
    const hitboxes = entity.getWorldHitboxes();
    const overlaps = world.entities
      .all()
      .some((other) =>
        doResolvedRectSetsOverlap(hitboxes, other.getWorldHitboxes()),
      );
    if (!overlaps) {
      return true;
    }
  }
  return false;
}

describe("collision fuzz", () => {
  beforeAll(bootstrapTypeRegistries);

  test.each(Array.from({ length: 250 }, (_, index) => index + 1))(
    "seed %s",
    (seed) => {
      const rng = makeTestRng(seed);
      const config = new GameConfig();
      config.debug.spawnMultiplier = 0;
      config.worldSize = {
        w: rngInt(rng, 360, 900),
        h: rngInt(rng, 360, 900),
      };
      const world = new World(config);

      const staticCount = rngInt(rng, 3, 12);
      for (let i = 0; i < staticCount; i += 1) {
        const wall = new Wall(world.allocEntityId(), rngInt(rng, 1, 2));
        if (!placeEntityWithoutInitialOverlap(world, wall, rng)) {
          continue;
        }
        world.spawn(wall);
      }

      const dynamicCount = rngInt(rng, 3, 10);
      for (let i = 0; i < dynamicCount; i += 1) {
        const entity =
          rngInt(rng, 0, 1) === 0
            ? new Player(world.allocEntityId(), `player-${i}`)
            : new Police(world.allocEntityId());
        if (!placeEntityWithoutInitialOverlap(world, entity, rng)) {
          continue;
        }
        entity.vx = randomVelocity(rng, 96);
        entity.vy = randomVelocity(rng, 96);
        entity.tick = () => {};
        world.spawn(entity);
      }

      const itemCount = rngInt(rng, 2, 6);
      for (let i = 0; i < itemCount; i += 1) {
        const inventory = new Inventory();
        inventory.addStackable(rngPick(rng, ITEM_TYPES), rngInt(rng, 1, 3));
        const item = new ItemEntity(world.allocEntityId(), inventory);
        if (!placeEntityWithoutInitialOverlap(world, item, rng)) {
          continue;
        }
        item.vx = randomVelocity(rng, 48);
        item.vy = randomVelocity(rng, 48);
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
          if (world.entities.all().length > expectedCount) {
            throw new Error(
              `entity count increased from ${expectedCount} to ${world.entities.all().length}`,
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
          { cause: error },
        );
      }
    },
  );
});

import { beforeAll, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Player } from "@server/entities/Player.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  expectDynamicOverlapState,
  expectNoDynamicStaticOverlap,
} from "../helpers/collisionExpectations.ts";

function makeWorld(): World {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  config.worldSize = { w: 300, h: 300 };
  return new World(config);
}

function spawnPlayer(world: World, x: number, y: number): Player {
  const player = new Player(world.allocEntityId(), "player");
  player.x = x;
  player.y = y;
  player.tick = () => {};
  world.spawn(player);
  return player;
}

function spawnEnemy(world: World, x: number, y: number): Police {
  const enemy = new Police(world.allocEntityId());
  enemy.x = x;
  enemy.y = y;
  enemy.tick = () => {};
  world.spawn(enemy);
  return enemy;
}

function spawnItem(
  world: World,
  x: number,
  y: number,
  typeId: ResourceId,
): ItemEntity {
  const inventory = new Inventory();
  inventory.addStackable(typeId, 1);
  const item = new ItemEntity(world.allocEntityId(), inventory);
  item.x = x;
  item.y = y;
  item.tick = () => {};
  world.spawn(item);
  return item;
}

function spawnWall(world: World, x: number, y: number): Wall {
  const wall = new Wall(world.allocEntityId(), 1);
  wall.x = x;
  wall.y = y;
  world.spawn(wall);
  return wall;
}

function step(world: World, count = 1): void {
  for (let index = 0; index < count; index += 1) {
    world.step();
  }
}

describe("item collision rules", () => {
  beforeAll(bootstrapTypeRegistries);
  const wallItemId = makeResourceId("item", "wall");
  const landmineItemId = makeResourceId("item", "landmine");

  test("player-player resolves", () => {
    const world = makeWorld();
    spawnPlayer(world, 120, 120);
    spawnPlayer(world, 120, 120);
    step(world);
    expectDynamicOverlapState(world, false);
  });

  test("player-enemy resolves", () => {
    const world = makeWorld();
    spawnPlayer(world, 120, 120);
    spawnEnemy(world, 120, 120);
    step(world);
    expectDynamicOverlapState(world, false);
  });

  test("enemy-enemy resolves", () => {
    const world = makeWorld();
    spawnEnemy(world, 120, 120);
    spawnEnemy(world, 120, 120);
    step(world);
    expectDynamicOverlapState(world, false);
  });

  test("player-item does not physically push", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 120, 120);
    const item = spawnItem(world, 120, 120, wallItemId);
    const startX = player.x;
    step(world);
    expect(player.x).toBeCloseTo(startX, 3);
    expectDynamicOverlapState(world, true);
    expect(item.x).toBeCloseTo(player.x, 1);
  });

  test("enemy-item does not physically push", () => {
    const world = makeWorld();
    const enemy = spawnEnemy(world, 120, 120);
    spawnItem(world, 120, 120, wallItemId);
    const startX = enemy.x;
    step(world);
    expect(enemy.x).toBeCloseTo(startX, 3);
  });

  test("mergeable item-item does not push", () => {
    const world = makeWorld();
    spawnItem(world, 120, 120, wallItemId);
    spawnItem(world, 120, 120, wallItemId);
    step(world);
    expectDynamicOverlapState(world, true);
  });

  test("non-mergeable item-item pushes", () => {
    const world = makeWorld();
    spawnItem(world, 120, 120, wallItemId);
    spawnItem(world, 120, 120, landmineItemId);
    step(world);
    expectDynamicOverlapState(world, false);
  });

  test("item near wall pushed by item avoids static penetration", () => {
    const world = makeWorld();
    const wall = spawnWall(world, 80, 150);
    spawnItem(world, wall.x + 10, wall.y, wallItemId);
    spawnItem(world, wall.x + 10, wall.y, landmineItemId);
    step(world, 2);
    expectNoDynamicStaticOverlap(world);
  });
});

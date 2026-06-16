import { beforeAll, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Wall } from "@server/registry/generated/buildingCtors.ts";
import { Player } from "@server/entities/Player.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  expectDynamicOverlapState,
  expectNoDynamicStaticOverlap,
} from "@tests/helpers/collisionExpectations.ts";

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

function distance(left: Entity, right: Entity): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
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
    const playerA = spawnPlayer(world, 120, 120);
    const playerB = spawnPlayer(world, 120, 120);
    const startDistance = distance(playerA, playerB);
    step(world, 4);
    expect(distance(playerA, playerB)).toBeGreaterThan(startDistance);
  });

  test("player-enemy resolves", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 120, 120);
    const enemy = spawnEnemy(world, 120, 120);
    const startDistance = distance(player, enemy);
    step(world, 4);
    expect(distance(player, enemy)).toBeGreaterThan(startDistance);
  });

  test("enemy-enemy resolves", () => {
    const world = makeWorld();
    const enemyA = spawnEnemy(world, 120, 120);
    const enemyB = spawnEnemy(world, 120, 120);
    const startDistance = distance(enemyA, enemyB);
    step(world, 4);
    expect(distance(enemyA, enemyB)).toBeGreaterThan(startDistance);
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
    const beforeCount = world.entities.all().length;
    spawnItem(world, 120, 120, wallItemId);
    spawnItem(world, 120, 120, wallItemId);
    step(world);
    if (world.entities.all().length === beforeCount + 2) {
      expectDynamicOverlapState(world, true);
    } else {
      expect(world.entities.all().length).toBe(beforeCount + 1);
    }
  });

  test("non-mergeable item-item pushes", () => {
    const world = makeWorld();
    const itemA = spawnItem(world, 120, 120, wallItemId);
    const itemB = spawnItem(world, 120, 120, landmineItemId);
    const startDistance = distance(itemA, itemB);
    step(world, 4);
    expect(distance(itemA, itemB)).toBeGreaterThan(startDistance);
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

import { beforeAll, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Player } from "@server/entities/Player.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  expectAllEntityPositionsFinite,
  expectNoDynamicEntityOutsideWorld,
  expectNoDynamicStaticOverlap,
} from "../helpers/collisionExpectations.ts";

function makeWorld(): World {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  config.worldSize = { w: 400, h: 300 };
  return new World(config);
}

function spawnPlayer(world: World, x: number, y: number): Player {
  const player = new Player(world.allocEntityId(), "test");
  player.x = x;
  player.y = y;
  player.tick = () => {};
  world.spawn(player);
  return player;
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

describe("static clipping", () => {
  beforeAll(bootstrapTypeRegistries);

  test("dynamic moves into vertical wall", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 150);
    const wall = spawnWall(world, 160, 150);
    player.vx = 80;
    player.vy = 0;
    step(world);
    const playerBounds = player.getWorldBounds();
    const wallBounds = wall.getWorldBounds();
    expect(playerBounds.maxX).toBeLessThanOrEqual(wallBounds.minX + 0.01);
    expectAllEntityPositionsFinite(world);
    expectNoDynamicEntityOutsideWorld(world);
    expectNoDynamicStaticOverlap(world);
  });

  test("dynamic moves into horizontal wall", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 150);
    const wall = spawnWall(world, 100, 210);
    player.vx = 0;
    player.vy = 80;
    step(world);
    const playerBounds = player.getWorldBounds();
    const wallBounds = wall.getWorldBounds();
    expect(playerBounds.maxY).toBeLessThanOrEqual(wallBounds.minY + 0.01);
    expectAllEntityPositionsFinite(world);
    expectNoDynamicEntityOutsideWorld(world);
    expectNoDynamicStaticOverlap(world);
  });

  test("high-speed movement into thin wall does not tunnel", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 50, 150);
    spawnWall(world, 200, 150);
    player.vx = 500;
    step(world);
    expectNoDynamicStaticOverlap(world);
    expectAllEntityPositionsFinite(world);
  });

  test("diagonal movement into wall clips blocked axis", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 100);
    const wall = spawnWall(world, 140, 100);
    const startY = player.y;
    player.vx = 60;
    player.vy = 40;
    step(world);
    expect(player.y).toBeGreaterThan(startY);
    expect(player.getWorldBounds().maxX).toBeLessThanOrEqual(
      wall.getWorldBounds().minX + 0.01,
    );
    expectNoDynamicStaticOverlap(world);
  });

  test("diagonal movement into corner avoids penetration", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 100);
    spawnWall(world, 140, 100);
    spawnWall(world, 100, 140);
    player.vx = 60;
    player.vy = 60;
    step(world);
    expectNoDynamicStaticOverlap(world);
  });

  test("starting touching wall and moving away succeeds", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 150);
    const wall = spawnWall(world, 132, 150);
    const playerHalfWidth =
      (player.getWorldBounds().maxX - player.getWorldBounds().minX) / 2;
    const wallHalfWidth =
      (wall.getWorldBounds().maxX - wall.getWorldBounds().minX) / 2;
    player.x = wall.x - (playerHalfWidth + wallHalfWidth);
    player.vx = -40;
    step(world);
    expect(player.x).toBeLessThan(wall.x);
    expectNoDynamicStaticOverlap(world);
  });

  test("starting touching wall and moving inward is blocked", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 150);
    const wall = spawnWall(world, 132, 150);
    const playerHalfWidth =
      (player.getWorldBounds().maxX - player.getWorldBounds().minX) / 2;
    const wallHalfWidth =
      (wall.getWorldBounds().maxX - wall.getWorldBounds().minX) / 2;
    player.x = wall.x - (playerHalfWidth + wallHalfWidth);
    const startX = player.x;
    player.vx = 40;
    step(world);
    expect(player.x).toBeLessThanOrEqual(startX + 0.01);
    expectNoDynamicStaticOverlap(world);
  });

  test("zero delta does not corrupt velocity", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 150);
    player.vx = 0;
    player.vy = 0;
    step(world);
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expectAllEntityPositionsFinite(world);
  });

  test("world bounds clamp left/right/top/bottom", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 5, 5);
    player.vx = -100;
    player.vy = -100;
    step(world);
    expect(player.x).toBeGreaterThanOrEqual(0);
    expect(player.y).toBeGreaterThanOrEqual(0);
    player.x = world.gameConfig.worldSize.w - 5;
    player.y = world.gameConfig.worldSize.h - 5;
    player.vx = 100;
    player.vy = 100;
    step(world);
    expect(player.x).toBeLessThanOrEqual(world.gameConfig.worldSize.w);
    expect(player.y).toBeLessThanOrEqual(world.gameConfig.worldSize.h);
    expectNoDynamicEntityOutsideWorld(world);
  });

  test("huge velocity stays finite", () => {
    const world = makeWorld();
    const player = spawnPlayer(world, 100, 100);
    player.vx = 10000;
    player.vy = -10000;
    step(world);
    expectAllEntityPositionsFinite(world);
  });

  test("overlapping static at spawn recovers", () => {
    const world = makeWorld();
    const wall = spawnWall(world, 120, 120);
    const player = spawnPlayer(world, wall.x, wall.y);
    player.vx = 0;
    player.vy = 0;
    step(world, 2);
    expectNoDynamicStaticOverlap(world);
  });
});

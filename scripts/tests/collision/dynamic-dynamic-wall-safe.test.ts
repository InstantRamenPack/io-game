import { beforeAll, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Player } from "@server/entities/Player.ts";
import { World } from "@server/world/World.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import {
  expectDynamicOverlapState,
  expectEntityMovedNoMoreThan,
  expectNoDynamicStaticOverlap,
} from "../helpers/collisionExpectations.ts";
import { findDynamicOverlapPairs } from "../helpers/collisionInvariants.ts";

function makeWorld(overrides: Partial<GameConfig["collision"]> = {}): World {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  config.worldSize = { w: 300, h: 300 };
  config.collision = { ...config.collision, ...overrides };
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

describe("dynamic-dynamic wall-safe correction", () => {
  beforeAll(bootstrapTypeRegistries);

  test("two entities overlap in open space", () => {
    const world = makeWorld();
    spawnPlayer(world, 120, 120);
    spawnPlayer(world, 120, 120);
    step(world);
    expectDynamicOverlapState(world, false);
  });

  test("entity next to wall not pushed into wall", () => {
    const world = makeWorld();
    const wall = spawnWall(world, 100, 150);
    const playerA = spawnPlayer(world, wall.x + 20, wall.y);
    const playerB = spawnPlayer(world, playerA.x + 10, playerA.y);
    step(world);
    expectNoDynamicStaticOverlap(world);
    expect(playerA.getWorldBounds().minX).toBeGreaterThanOrEqual(
      wall.getWorldBounds().maxX - 0.5,
    );
    expect(playerB.getWorldBounds().minX).toBeGreaterThanOrEqual(
      wall.getWorldBounds().maxX - 0.5,
    );
  });

  test("blocked correction transfers to free entity", () => {
    const world = makeWorld();
    const wall = spawnWall(world, 80, 150);
    const playerA = spawnPlayer(world, wall.x + 20, wall.y);
    const playerB = spawnPlayer(world, playerA.x + 10, playerA.y);
    const beforeB = { x: playerB.x, y: playerB.y };
    step(world);
    expectNoDynamicStaticOverlap(world);
    expect(Math.hypot(playerB.x - beforeB.x, playerB.y - beforeB.y)).toBeGreaterThan(0);
  });

  test("both entities blocked by walls allow residual overlap", () => {
    const world = makeWorld();
    spawnWall(world, 80, 150);
    spawnWall(world, 160, 150);
    spawnPlayer(world, 120, 150);
    spawnPlayer(world, 120, 150);
    step(world);
    expectDynamicOverlapState(world, true);
    expectNoDynamicStaticOverlap(world);
  });

  test("max correction per tick is respected", () => {
    const world = makeWorld({ maxDynamicCorrectionPerTick: 8 });
    const playerA = spawnPlayer(world, 120, 120);
    const playerB = spawnPlayer(world, 120, 120);
    const beforeA = { x: playerA.x, y: playerA.y };
    const beforeB = { x: playerB.x, y: playerB.y };
    step(world);
    expectEntityMovedNoMoreThan(
      { ...playerA, x: beforeA.x, y: beforeA.y } as Player,
      playerA,
      8,
    );
    expectEntityMovedNoMoreThan(
      { ...playerB, x: beforeB.x, y: beforeB.y } as Player,
      playerB,
      8,
    );
  });

  test("push scale 0.5 reduces correction", () => {
    const fullWorld = makeWorld({ dynamicPushScale: 1 });
    const halfWorld = makeWorld({ dynamicPushScale: 0.5 });
    const fullA = spawnPlayer(fullWorld, 120, 120);
    const fullB = spawnPlayer(fullWorld, 120, 120);
    const halfA = spawnPlayer(halfWorld, 120, 120);
    const halfB = spawnPlayer(halfWorld, 120, 120);
    step(fullWorld);
    step(halfWorld);
    const fullDistance = Math.hypot(fullA.x - fullB.x, fullA.y - fullB.y);
    const halfDistance = Math.hypot(halfA.x - halfB.x, halfA.y - halfB.y);
    expect(halfDistance).toBeLessThanOrEqual(fullDistance + 0.01);
  });

  test("solver iterations improve separation", () => {
    const worldOne = makeWorld({ dynamicSolverIterations: 1 });
    const worldTwo = makeWorld({ dynamicSolverIterations: 2 });
    spawnPlayer(worldOne, 120, 120);
    spawnPlayer(worldOne, 120, 120);
    spawnPlayer(worldTwo, 120, 120);
    spawnPlayer(worldTwo, 120, 120);
    step(worldOne);
    step(worldTwo);
    const overlapsOne = findDynamicOverlapPairs(worldOne).length;
    const overlapsTwo = findDynamicOverlapPairs(worldTwo).length;
    expect(overlapsTwo).toBeLessThanOrEqual(overlapsOne);
  });

  test("deterministic ordering across insertion order", () => {
    const worldA = makeWorld();
    const worldB = makeWorld();
    const a1 = spawnPlayer(worldA, 120, 120);
    const a2 = spawnPlayer(worldA, 120, 120);
    const b2 = spawnPlayer(worldB, 120, 120);
    const b1 = spawnPlayer(worldB, 120, 120);
    step(worldA);
    step(worldB);
    expect(a1.x).toBeCloseTo(b1.x, 3);
    expect(a2.x).toBeCloseTo(b2.x, 3);
  });

  test("dense crowd in small room avoids static penetration", () => {
    const world = makeWorld();
    spawnWall(world, 60, 60);
    spawnWall(world, 240, 60);
    spawnWall(world, 60, 240);
    spawnWall(world, 240, 240);
    for (let index = 0; index < 12; index += 1) {
      spawnPlayer(world, 140 + (index % 4) * 4, 140 + Math.floor(index / 4) * 4);
    }
    step(world, 3);
    expectNoDynamicStaticOverlap(world);
  });

  test("long chain of entities against wall stays out of wall", () => {
    const world = makeWorld();
    const wall = spawnWall(world, 80, 150);
    for (let index = 0; index < 6; index += 1) {
      spawnPlayer(world, wall.x + 10 + index * 12, wall.y);
    }
    step(world, 2);
    expectNoDynamicStaticOverlap(world);
  });
});

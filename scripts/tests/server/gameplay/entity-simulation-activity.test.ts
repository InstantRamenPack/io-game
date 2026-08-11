import { beforeAll, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import { Structure } from "@server/entities/Structure.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Dungeon } from "@server/entities/structures/Dungeon.ts";
import { Hub } from "@server/entities/tower/Hub.ts";
import { BasicBullet } from "@server/registry/generated/contentProjectileCtors.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { generateProceduralWorldLayout } from "@server/world/generation/generateProceduralWorldLayout.ts";
import { World } from "@server/world/World.ts";

function makeGameplayWorld(): World {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  const world = new World(config, 1337, "gameplay");
  world.proceduralLayout = generateProceduralWorldLayout(1337);
  return world;
}

function spawnPlayer(world: World, x: number, y: number): Player {
  const player = new Player(world.allocEntityId(), "simulation-test");
  player.x = x;
  player.y = y;
  world.spawn(player);
  return player;
}

function spawnDrifter(world: World, x: number, y: number): Drifter {
  const enemy = new Drifter(world.allocEntityId());
  enemy.x = x;
  enemy.y = y;
  world.spawn(enemy);
  return enemy;
}

describe("entity simulation activity", () => {
  beforeAll(bootstrapTypeRegistries);

  test("gameplay always activates players, buildings, towers, structures, projectiles, and wave enemies", () => {
    const world = makeGameplayWorld();
    const player = spawnPlayer(world, 0, 0);
    const tower = new Hub(world.allocEntityId());
    const structure = new Dungeon(world.allocEntityId());
    const projectile = new BasicBullet(world.allocEntityId(), {
      ownerId: player.id,
      x: 0,
      y: 0,
      directionX: 1,
      directionY: 0,
    });
    const waveEnemy = spawnDrifter(world, 12_000, 12_000);
    waveEnemy.spawnSource = "wave";

    expect(tower).toBeInstanceOf(Building);
    expect(structure).toBeInstanceOf(Structure);
    expect(projectile).toBeInstanceOf(Projectile);
    expect(waveEnemy).toBeInstanceOf(Enemy);
    for (const entity of [player, tower, structure, projectile, waveEnemy]) {
      expect(world.shouldRunEntityGoalsAndCollisions(entity)).toBe(true);
    }
  });

  test("gameplay uses the replication radius for goals while base effects keep ticking", () => {
    const world = makeGameplayWorld();
    const enemy = spawnDrifter(world, 100, 100);
    enemy.spawnSource = "layout";
    const player = spawnPlayer(world, 3000, 100);
    let goalTicks = 0;
    let weaponTicks = 0;
    enemy.goalSelector.tick = () => {
      goalTicks += 1;
    };
    enemy.weapons[0]!.tick = () => {
      weaponTicks += 1;
    };
    enemy.applyOrRefreshActiveEffect({
      typeId: "effect:test" as ResourceId,
      ticksRemaining: 3,
    });

    world.step();

    expect(goalTicks).toBe(0);
    expect(weaponTicks).toBe(1);
    expect(enemy.getActiveEffectSnapshots()[0]?.ticksRemaining).toBe(2);

    player.x = enemy.x + world.gameConfig.replication.interestRadius;
    player.y = enemy.y;
    enemy.targetId = player.id;
    world.step();

    expect(goalTicks).toBe(1);
    expect(weaponTicks).toBe(2);
    expect(enemy.getActiveEffectSnapshots()[0]?.ticksRemaining).toBe(1);
  });

  test("idle layout enemies sleep outside the active simulation area", () => {
    const world = makeGameplayWorld();
    const enemy = spawnDrifter(world, 100, 100);
    enemy.spawnSource = "layout";
    const player = spawnPlayer(world, 3000, 100);
    let weaponTicks = 0;
    enemy.weapons[0]!.tick = () => {
      weaponTicks += 1;
    };

    world.step();
    expect(weaponTicks).toBe(0);

    player.x = enemy.x;
    player.y = enemy.y;
    world.step();
    expect(weaponTicks).toBe(1);
  });

  test("projectiles keep moving outside player range and the center sector", () => {
    const world = makeGameplayWorld();
    const player = spawnPlayer(world, 0, 0);
    const projectile = new BasicBullet(world.allocEntityId(), {
      ownerId: player.id,
      x: 10_000,
      y: 10_000,
      directionX: 1,
      directionY: 0,
    });
    world.spawn(projectile);
    const startX = projectile.x;

    world.step();

    expect(world.entities.has(projectile.id)).toBe(true);
    expect(projectile.x).toBeGreaterThan(startX);
  });

  test("inactive gameplay enemies do not participate in collision until activated", () => {
    const world = makeGameplayWorld();
    const first = spawnDrifter(world, 100, 100);
    const second = spawnDrifter(world, 100, 100);
    const player = spawnPlayer(world, 3000, 100);
    first.goalSelector.tick = () => {};
    second.goalSelector.tick = () => {};

    world.step();

    expect(first.x).toBe(100);
    expect(second.x).toBe(100);
    expect(first.y).toBe(100);
    expect(second.y).toBe(100);

    player.x = 100;
    player.y = 100;
    world.step();

    expect(first.x !== 100 || first.y !== 100).toBe(true);
    expect(second.x !== 100 || second.y !== 100).toBe(true);
  });

  test("the exact generated 2560 by 2560 center sector is always active", () => {
    const world = makeGameplayWorld();
    const layout = world.proceduralLayout!;
    const center = layout.sectors.find(
      (sector) => sector.id === layout.centerSectorId,
    )!;
    const inside = spawnDrifter(world, center.minX, center.minY);
    const outside = spawnDrifter(world, center.minX - 1, center.minY - 1);

    expect(center.maxX - center.minX).toBe(2560);
    expect(center.maxY - center.minY).toBe(2560);
    expect(world.shouldRunEntityGoalsAndCollisions(inside)).toBe(true);
    expect(world.shouldRunEntityGoalsAndCollisions(outside)).toBe(false);
  });

  test("lobby worlds simulate every entity because they have no gameplay sectors", () => {
    const config = new GameConfig();
    config.debug.spawnMultiplier = 0;
    const world = new World(config, 1337, "lobby");
    const enemy = spawnDrifter(world, 12_000, 12_000);

    expect(world.proceduralLayout).toBeNull();
    expect(world.shouldRunEntityGoalsAndCollisions(enemy)).toBe(true);
  });
});

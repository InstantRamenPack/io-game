import { beforeAll, describe, expect, test } from "bun:test";
import { canTeamDamage } from "@shared/combat/CombatTeam.ts";
import { Landmine } from "@server/entities/buildings/Landmine.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { CrateStructure } from "@server/entities/structures/CrateStructure.ts";
import { DungeonWall } from "@server/entities/structures/DungeonWall.ts";
import { TripwireStructure } from "@server/entities/structures/TripwireStructure.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnEnemy,
  spawnPlayerLikeDynamic,
  spawnWall,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("combat teams", () => {
  beforeAll(bootstrapTestRegistries);

  test("team damage matrix allows and blocks expected pairs", () => {
    expect(canTeamDamage("player", "enemy")).toBe(true);
    expect(canTeamDamage("player", "player")).toBe(true);
    expect(canTeamDamage("enemy", "player")).toBe(true);
    expect(canTeamDamage("environment", "player")).toBe(true);

    expect(canTeamDamage("player", "environment")).toBe(false);
    expect(canTeamDamage("enemy", "enemy")).toBe(false);
    expect(canTeamDamage("enemy", "environment")).toBe(false);
    expect(canTeamDamage("environment", "enemy")).toBe(false);
    expect(canTeamDamage("environment", "environment")).toBe(false);
  });

  test("DamageEffect.canApply follows the team matrix", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const enemy = spawnEnemy(
      runtime,
      "shoota",
      player.x + 40,
      player.y,
    ) as Enemy;
    const wall = spawnWall(runtime, player.x + 80, player.y, {
      ownerId: player.id,
    });
    const crate = new CrateStructure(runtime.world.allocEntityId());
    crate.x = player.x + 120;
    crate.y = player.y;
    runtime.world.spawn(crate);
    const dungeonWall = new DungeonWall(runtime.world.allocEntityId());
    dungeonWall.x = player.x + 160;
    dungeonWall.y = player.y;
    runtime.world.spawn(dungeonWall);

    expect(DamageEffect.canApply(runtime.world, player, enemy)).toBe(true);
    expect(DamageEffect.canApply(runtime.world, player, wall)).toBe(true);
    expect(DamageEffect.canApply(runtime.world, player, crate)).toBe(true);
    expect(DamageEffect.canApply(runtime.world, player, dungeonWall)).toBe(
      false,
    );

    expect(DamageEffect.canApply(runtime.world, enemy, player)).toBe(true);
    expect(DamageEffect.canApply(runtime.world, enemy, wall)).toBe(true);
    expect(DamageEffect.canApply(runtime.world, enemy, crate)).toBe(false);

    expect(DamageEffect.canApply(runtime.world, dungeonWall, player)).toBe(
      true,
    );
    expect(DamageEffect.canApply(runtime.world, dungeonWall, enemy)).toBe(
      false,
    );
    expect(DamageEffect.canApply(runtime.world, dungeonWall, crate)).toBe(
      false,
    );
  });

  test("tripwire triggers on player team members but not enemies", () => {
    const { runtime } = makeRuntime();
    const x = runtime.world.gameConfig.worldSize.w / 2;
    const y = runtime.world.gameConfig.worldSize.h / 2;
    const player = spawnPlayerLikeDynamic(runtime, x, y);
    const enemy = spawnEnemy(runtime, "shoota", x, y) as Enemy;
    const tripwire = new TripwireStructure(runtime.world.allocEntityId());
    tripwire.x = x;
    tripwire.y = y;
    runtime.world.spawn(tripwire);
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(tripwire.id)).toBe(false);
    expect(player.activeEffects.length).toBeGreaterThan(0);

    const enemyTripwire = new TripwireStructure(runtime.world.allocEntityId());
    enemyTripwire.x = x + 200;
    enemyTripwire.y = y;
    runtime.world.spawn(enemyTripwire);
    enemy.x = x + 200;
    enemy.y = y;
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(enemyTripwire.id)).toBe(true);
    expect(enemy.activeEffects.length).toBe(0);
  });

  test("enemies damage player-team buildings", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const enemy = spawnEnemy(
      runtime,
      "shoota",
      player.x + 40,
      player.y,
    ) as Enemy;
    const wall = spawnWall(runtime, player.x + 80, player.y, {
      ownerId: player.id,
    });
    const startingHp = wall.hp;

    new DamageEffect(15).apply(runtime.world, enemy, wall);

    expect(wall.hp).toBe(startingHp - 15);
  });

  test("players damage enemy-team crates", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const crate = new CrateStructure(runtime.world.allocEntityId());
    crate.x = player.x + 40;
    crate.y = player.y;
    runtime.world.spawn(crate);
    const startingHp = crate.hp;

    new DamageEffect(1).apply(runtime.world, player, crate);

    expect(crate.hp).toBe(startingHp - 1);
  });

  test("landmine triggers on enemy team members", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const landmine = new Landmine(runtime.world.allocEntityId(), 1, player.id);
    landmine.x = player.x + 64;
    landmine.y = player.y;
    runtime.world.spawn(landmine);

    const enemy = spawnEnemy(
      runtime,
      "shoota",
      landmine.x + 8,
      landmine.y,
    ) as Enemy;
    const startingHp = enemy.hp;
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(landmine.id)).toBe(false);
    expect(enemy.hp).toBeLessThan(startingHp);
  });
});

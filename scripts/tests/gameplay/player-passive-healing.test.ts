import { beforeAll, describe, expect, test } from "bun:test";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const PASSIVE_HEAL_INTERVAL_TICKS = 40;
const FOOD_DRAIN_PER_TICK = 100 / (3 * 60 * 20);
const PASSIVE_HEAL_FOOD_COST = 1;

describe("player passive healing", () => {
  beforeAll(bootstrapTestRegistries);

  test("passive healing consumes food when it restores health", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = player.maxHp * 0.75;
    player.food = 10;

    tick(runtime, PASSIVE_HEAL_INTERVAL_TICKS);

    expect(player.hp).toBe(player.maxHp * 0.75 + 1);
    expect(player.food).toBeCloseTo(
      10 -
        FOOD_DRAIN_PER_TICK * PASSIVE_HEAL_INTERVAL_TICKS -
        PASSIVE_HEAL_FOOD_COST,
    );
  });

  test("passive healing stops when food is empty", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = player.maxHp * 0.75;
    player.food = 0;

    tick(runtime, PASSIVE_HEAL_INTERVAL_TICKS);

    expect(player.hp).toBe(player.maxHp * 0.75);
    expect(player.food).toBe(0);
  });

  test("passive healing works below half health", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = player.maxHp * 0.25;
    player.food = 10;

    tick(runtime, PASSIVE_HEAL_INTERVAL_TICKS);

    expect(player.hp).toBe(player.maxHp * 0.25 + 1);
    expect(player.food).toBeCloseTo(
      10 -
        FOOD_DRAIN_PER_TICK * PASSIVE_HEAL_INTERVAL_TICKS -
        PASSIVE_HEAL_FOOD_COST,
    );
  });

  test("passive healing waits for the slow heal interval", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = player.maxHp * 0.25;
    player.food = 10;

    tick(runtime, PASSIVE_HEAL_INTERVAL_TICKS - 1);

    expect(player.hp).toBe(player.maxHp * 0.25);
    expect(player.food).toBeCloseTo(
      10 - FOOD_DRAIN_PER_TICK * (PASSIVE_HEAL_INTERVAL_TICKS - 1),
    );
  });
});

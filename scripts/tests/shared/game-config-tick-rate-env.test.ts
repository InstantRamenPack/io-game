import { afterEach, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { makeClientRuntimeConfig } from "@shared/config/ClientRuntimeConfig.ts";
import { ClientRuntimeConfigSchema } from "@shared/config/ClientRuntimeConfig.ts";

const originalTickRate = process.env.TICK_RATE;
const originalDebugTickRate = process.env.DEBUG_TICK_RATE;

afterEach(() => {
  if (originalTickRate === undefined) {
    delete process.env.TICK_RATE;
  } else {
    process.env.TICK_RATE = originalTickRate;
  }
  if (originalDebugTickRate === undefined) {
    delete process.env.DEBUG_TICK_RATE;
  } else {
    process.env.DEBUG_TICK_RATE = originalDebugTickRate;
  }
});

describe("GameConfig TICK_RATE env override", () => {
  test("loads fractional tick rates for low-CPU deployments", () => {
    process.env.TICK_RATE = "7.5";
    const config = GameConfig.load();
    expect(config.tickRate).toBe(7.5);
    expect(
      ClientRuntimeConfigSchema.safeParse(makeClientRuntimeConfig(config))
        .success,
    ).toBe(true);
  });

  test("loads simulation speed multiplier for scaled low-rate servers", () => {
    delete process.env.TICK_RATE;
    process.env.TICK_RATE = "10";
    process.env.SIMULATION_SPEED_MULTIPLIER = "2";
    const config = GameConfig.load();
    expect(config.tickRate).toBe(10);
    expect(config.simulationSpeedMultiplier).toBe(2);
    const runtimeConfig = makeClientRuntimeConfig(config);
    expect(runtimeConfig.simulationSpeedMultiplier).toBe(2);
    expect(ClientRuntimeConfigSchema.safeParse(runtimeConfig).success).toBe(
      true,
    );
  });
});

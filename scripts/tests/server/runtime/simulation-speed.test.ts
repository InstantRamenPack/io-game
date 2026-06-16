import { afterEach, describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { getEffectiveSimulationTickRate } from "@shared/config/simulationSpeed.ts";

const originalTickRate = process.env.TICK_RATE;
const originalSimulationSpeed = process.env.SIMULATION_SPEED_MULTIPLIER;

afterEach(() => {
  if (originalTickRate === undefined) {
    delete process.env.TICK_RATE;
  } else {
    process.env.TICK_RATE = originalTickRate;
  }
  if (originalSimulationSpeed === undefined) {
    delete process.env.SIMULATION_SPEED_MULTIPLIER;
  } else {
    process.env.SIMULATION_SPEED_MULTIPLIER = originalSimulationSpeed;
  }
});

describe("simulation speed multiplier", () => {
  test("Render-style 10 TPS with 2x speed matches 20 TPS gameplay rate", () => {
    process.env.TICK_RATE = "10";
    process.env.SIMULATION_SPEED_MULTIPLIER = "2";
    const config = GameConfig.load();
    expect(
      getEffectiveSimulationTickRate({
        tickRate: config.tickRate,
        simulationSpeedMultiplier: config.simulationSpeedMultiplier,
      }),
    ).toBe(20);
  });
});

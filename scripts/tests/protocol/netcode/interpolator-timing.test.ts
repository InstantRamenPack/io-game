import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import {
  makePlayerSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";
import { simulateNetworkedSnapshotStream } from "@tests/helpers/interpolationFixtures.ts";

describe("interpolator timing", () => {
  test("perfect network keeps render delay near min", () => {
    const config = new GameConfig();
    const result = simulateNetworkedSnapshotStream({
      profileName: "perfect",
      seed: 1,
      durationMs: 2000,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      positionAtTick: (tick) => ({
        x: tick * 10,
        y: 0,
        vx: 10,
        vy: 0,
      }),
    });
    const minDelay = config.interpolation.minRenderDelayTicks;
    const renderDelays = result.debugFrames.map(
      (frame) => frame.renderDelayTicks,
    );
    const targets = result.debugFrames.map(
      (frame) => frame.targetRenderDelayTicks,
    );
    expect(Math.min(...renderDelays)).toBeGreaterThanOrEqual(minDelay - 0.5);
    expect(Math.max(...renderDelays)).toBeLessThanOrEqual(minDelay + 0.75);
    expect(targets.some((value) => Math.abs(value - minDelay) <= 0.5)).toBe(
      true,
    );
  });

  test("bad network increases target render delay above min", () => {
    const config = new GameConfig();
    const result = simulateNetworkedSnapshotStream({
      profileName: "bad",
      seed: 5,
      durationMs: 2500,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      positionAtTick: (tick) => ({
        x: tick * 10,
        y: 0,
        vx: 10,
        vy: 0,
      }),
    });
    const minDelay = config.interpolation.minRenderDelayTicks;
    expect(
      result.debugFrames.some(
        (frame) => frame.targetRenderDelayTicks > minDelay,
      ),
    ).toBe(true);
    expect(result.debugFrames.some((frame) => frame.jitterEstimateMs > 0)).toBe(
      true,
    );
  });

  test("render delay clamps to max", () => {
    const result = simulateNetworkedSnapshotStream({
      profileName: "bad",
      seed: 9,
      durationMs: 2500,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      interpolationConfig: {
        minRenderDelayTicks: 2,
        maxRenderDelayTicks: 3,
        jitterBufferMultiplier: 10,
        jitterBufferSafetyMs: 120,
      },
      positionAtTick: (tick) => ({
        x: tick * 10,
        y: 0,
        vx: 10,
        vy: 0,
      }),
    });
    const maxDelay = 3;
    expect(
      result.debugFrames.every(
        (frame) => frame.renderDelayTicks <= maxDelay + 0.5,
      ),
    ).toBe(true);
    expect(
      result.debugFrames.every(
        (frame) => frame.targetRenderDelayTicks <= maxDelay + 0.5,
      ),
    ).toBe(true);
  });

  test("observed tick duration clamp lower bound", () => {
    const config = new GameConfig();
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      ...config.interpolation,
      expectedSnapshotMs: 50,
    });
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 0);
    state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 10, 0)]), 1);
    interpolator.updateInterpolation(state, 1, 16, 1);
    const observedTickMs = (
      interpolator as unknown as { observedTickMs: number }
    ).observedTickMs;
    expect(observedTickMs).toBeGreaterThanOrEqual(
      50 * config.interpolation.tickDurationMinFactor,
    );
  });

  test("observed tick duration clamp upper bound", () => {
    const config = new GameConfig();
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      ...config.interpolation,
      expectedSnapshotMs: 50,
    });
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 0);
    state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 10, 0)]), 1000);
    interpolator.updateInterpolation(state, 1000, 16, 1);
    const observedTickMs = (
      interpolator as unknown as { observedTickMs: number }
    ).observedTickMs;
    expect(observedTickMs).toBeLessThanOrEqual(
      50 * config.interpolation.tickDurationMaxFactor,
    );
  });
});

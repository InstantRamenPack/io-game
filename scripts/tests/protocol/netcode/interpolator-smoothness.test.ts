import { describe, expect, test } from "bun:test";
import { DebugNetworkSimulator } from "@client/net/DebugNetworkSimulator.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import {
  computeSmoothnessMetrics,
  summarizeInterpolationModes,
  type MotionSample,
} from "@tests/helpers/smoothnessMetrics.ts";
import {
  makePlayerSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";
import { simulateNetworkedSnapshotStream } from "@tests/helpers/interpolationFixtures.ts";

type SimulationResult = ReturnType<typeof simulateNetworkedSnapshotStream>;

const DEFAULT_POSITION = (tick: number) => ({
  x: tick * 10,
  y: 0,
  vx: 10,
  vy: 0,
});

function assertSmoothness(
  profileName: string,
  seed: number,
  result: SimulationResult,
  assertion: () => void,
): void {
  try {
    assertion();
  } catch (error) {
    console.error({
      profileName,
      seed,
      metrics: result.metrics,
      modeSummary: result.modeSummary,
      snapshotStats: result.snapshotStats,
      latestDebugFrame: result.debugFrames[result.debugFrames.length - 1],
      worstFrames: result.metrics.worstFrames.slice(0, 10),
    });
    throw error;
  }
}

function simulateCustomDeliveries(options: {
  deliveries: Array<{
    timeMs: number;
    snapshot: ReturnType<typeof makeSnapshot>;
  }>;
  durationMs: number;
  frameMs: number;
  entityId: number;
}): SimulationResult {
  const worldState = new ClientWorldState(8);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 50,
    minRenderDelayTicks: 2,
    maxRenderDelayTicks: 5,
    maxExtrapolationTicks: 0.35,
    jitterBufferMultiplier: 3,
    jitterBufferSafetyMs: 35,
  });
  const samples: MotionSample[] = [];
  const debugFrames = [] as SimulationResult["debugFrames"];
  const warmupMs = 500;
  let deliveryIndex = 0;
  const deliveries = [...options.deliveries].sort(
    (left, right) => left.timeMs - right.timeMs,
  );

  for (
    let frameTimeMs = 0;
    frameTimeMs <= options.durationMs;
    frameTimeMs += options.frameMs
  ) {
    while (
      deliveryIndex < deliveries.length &&
      deliveries[deliveryIndex]!.timeMs <= frameTimeMs
    ) {
      const delivery = deliveries[deliveryIndex]!;
      worldState.pushSnapshot(delivery.snapshot, delivery.timeMs);
      deliveryIndex += 1;
    }

    interpolator.updateInterpolation(
      worldState,
      frameTimeMs,
      options.frameMs,
      options.entityId,
    );
    const debugFrame = interpolator.getLatestDebugFrame();
    if (debugFrame) {
      debugFrames.push(debugFrame);
      if (debugFrame.localPlayer && frameTimeMs >= warmupMs) {
        samples.push({
          timeMs: frameTimeMs,
          x: debugFrame.localPlayer.renderedX,
          y: debugFrame.localPlayer.renderedY,
        });
      }
    }
  }

  const metrics = computeSmoothnessMetrics(
    samples,
    { x: 1, y: 0 },
    {
      debugFrames,
    },
  );
  const modeSummary = summarizeInterpolationModes(debugFrames, warmupMs);

  return {
    samples,
    debugFrames,
    snapshotStats: worldState.getSnapshotReceiveStats(),
    modeSummary,
    metrics,
  };
}

describe("interpolator smoothness", () => {
  test("perfect network produces stable remote velocity", () => {
    const result = simulateNetworkedSnapshotStream({
      profileName: "perfect",
      seed: 1,
      durationMs: 5000,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      positionAtTick: DEFAULT_POSITION,
    });

    assertSmoothness("perfect", 1, result, () => {
      expect(result.metrics.velocityCoeffVar).toBeLessThanOrEqual(0.08);
      expect(result.metrics.freezeFrameCount).toBe(0);
      expect(result.metrics.reverseFrameCount).toBe(0);
      expect(result.metrics.largeStepCount).toBe(0);
      expect(result.modeSummary.snapCount).toBe(0);
      expect(result.modeSummary.extrapolateRatio).toBe(0);
      expect(result.modeSummary.interpolateRatio).toBeGreaterThanOrEqual(0.95);
    });
  });

  test.each([1, 2, 3, 42, 99])(
    "mild network remains smooth enough (seed %s)",
    (seed) => {
      const config = new GameConfig();
      const result = simulateNetworkedSnapshotStream({
        profileName: "mild",
        seed,
        durationMs: 8000,
        serverTickMs: 50,
        frameMs: 1000 / 60,
        entityId: 1,
        positionAtTick: DEFAULT_POSITION,
      });

      assertSmoothness("mild", seed, result, () => {
        expect(result.metrics.velocityCoeffVar).toBeLessThanOrEqual(0.22);
        expect(result.metrics.freezeFrameCount).toBeLessThanOrEqual(2);
        expect(result.metrics.reverseFrameCount).toBe(0);
        expect(result.metrics.largeStepCount).toBeLessThanOrEqual(2);
        expect(result.modeSummary.snapCount).toBe(0);
        expect(result.modeSummary.interpolateRatio).toBeGreaterThanOrEqual(
          0.85,
        );

        const minDelay = config.interpolation.minRenderDelayTicks;
        const maxDelay = config.interpolation.maxRenderDelayTicks;
        for (const frame of result.debugFrames) {
          expect(frame.renderDelayTicks).toBeGreaterThanOrEqual(
            minDelay - 0.25,
          );
          expect(frame.renderDelayTicks).toBeLessThanOrEqual(maxDelay + 0.25);
          expect(frame.targetRenderDelayTicks).toBeGreaterThanOrEqual(
            minDelay - 0.25,
          );
          expect(frame.targetRenderDelayTicks).toBeLessThanOrEqual(
            maxDelay + 0.25,
          );
        }
      });
    },
  );

  test.each([1, 2, 3, 42, 99, 12345])(
    "bad network remote motion stays within thresholds (seed %s)",
    (seed) => {
      const config = new GameConfig();
      const result = simulateNetworkedSnapshotStream({
        profileName: "bad",
        seed,
        durationMs: 10000,
        serverTickMs: 50,
        frameMs: 1000 / 60,
        entityId: 1,
        positionAtTick: DEFAULT_POSITION,
      });

      assertSmoothness("bad", seed, result, () => {
        expect(result.metrics.velocityCoeffVar).toBeLessThanOrEqual(0.4);
        expect(result.metrics.freezeFrameCount).toBeLessThanOrEqual(8);
        expect(result.metrics.reverseFrameCount).toBe(0);
        expect(result.metrics.largeStepCount).toBeLessThanOrEqual(8);
        expect(result.modeSummary.snapCount).toBe(0);
        expect(result.modeSummary.interpolateRatio).toBeGreaterThanOrEqual(0.7);
        expect(result.modeSummary.extrapolateRatio).toBeLessThanOrEqual(0.2);

        const minDelay = config.interpolation.minRenderDelayTicks;
        const maxDelay = config.interpolation.maxRenderDelayTicks;
        const renderDelays = result.debugFrames.map(
          (frame) => frame.renderDelayTicks,
        );
        expect(renderDelays.some((delay) => delay > minDelay)).toBe(true);
        expect(renderDelays.every((delay) => delay <= maxDelay + 0.25)).toBe(
          true,
        );
      });
    },
  );

  test("bad network adaptive render delay reduces underruns", () => {
    const adaptive = simulateNetworkedSnapshotStream({
      profileName: "bad",
      seed: 7,
      durationMs: 9000,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      positionAtTick: DEFAULT_POSITION,
    });
    const fixed = simulateNetworkedSnapshotStream({
      profileName: "bad",
      seed: 7,
      durationMs: 9000,
      serverTickMs: 50,
      frameMs: 1000 / 60,
      entityId: 1,
      interpolationConfig: {
        minRenderDelayTicks: 2,
        maxRenderDelayTicks: 2,
        renderDelaySmoothing: 1,
      },
      positionAtTick: DEFAULT_POSITION,
    });

    const adaptiveHold =
      adaptive.modeSummary.holdRatio + adaptive.modeSummary.extrapolateRatio;
    const fixedHold =
      fixed.modeSummary.holdRatio + fixed.modeSummary.extrapolateRatio;
    expect(adaptiveHold).toBeLessThan(fixedHold);
    expect(adaptive.metrics.velocityCoeffVar).toBeLessThan(
      fixed.metrics.velocityCoeffVar,
    );
    expect(adaptive.metrics.jerkP95).toBeLessThan(fixed.metrics.jerkP95);
  });

  test("burst packet loss causes bounded visual damage then recovers", () => {
    const simulator = new DebugNetworkSimulator();
    simulator.configure({ profileName: "perfect", seed: 1, enabled: true });
    const deliveries: Array<{
      timeMs: number;
      snapshot: ReturnType<typeof makeSnapshot>;
    }> = [];
    const burstStart = 25;
    const burstEnd = 32;
    for (let tick = 1, timeMs = 0; timeMs <= 4000; tick += 1, timeMs += 50) {
      if (tick >= burstStart && tick <= burstEnd) {
        continue;
      }
      const snapshot = makeSnapshot(tick, [
        makePlayerSnapshot(1, tick * 10, 0, { vx: 10, vy: 0 }),
      ]);
      for (const delivery of simulator.planDeliveries(
        JSON.stringify({ t: "snapshot", snapshot }),
      )) {
        deliveries.push({ timeMs: timeMs + delivery.delayMs, snapshot });
      }
    }

    const result = simulateCustomDeliveries({
      deliveries,
      durationMs: 4000,
      frameMs: 1000 / 60,
      entityId: 1,
    });
    const burstEndTime = burstEnd * 50;
    const postBurstFrames = result.debugFrames.filter(
      (frame) => frame.frameTimeMs > burstEndTime + 500,
    );
    expect(
      result.debugFrames.some(
        (frame) =>
          frame.interpolationMode === "hold" ||
          frame.interpolationMode === "extrapolate",
      ),
    ).toBe(true);
    expect(
      postBurstFrames.some(
        (frame) => frame.interpolationMode === "interpolate",
      ),
    ).toBe(true);
    const overrunTicks = result.debugFrames
      .map((frame) => frame.localPlayer?.overrunTicks ?? 0)
      .filter((value) => value !== null);
    expect(Math.max(...overrunTicks)).toBeLessThanOrEqual(0.35);
    expect(result.metrics.freezeFrameCount).toBeLessThanOrEqual(24);
    expect(result.modeSummary.snapCount).toBeLessThanOrEqual(1);
  });

  test("delayed burst does not cause huge catch-up jump", () => {
    const simulator = new DebugNetworkSimulator();
    simulator.configure({ profileName: "perfect", seed: 1, enabled: true });
    const deliveries: Array<{
      timeMs: number;
      snapshot: ReturnType<typeof makeSnapshot>;
    }> = [];
    for (let tick = 1, timeMs = 0; timeMs <= 4000; tick += 1, timeMs += 50) {
      let adjustedTime = timeMs;
      if (tick >= 20 && tick <= 24) {
        adjustedTime += 300;
      }
      const snapshot = makeSnapshot(tick, [
        makePlayerSnapshot(1, tick * 10, 0, { vx: 10, vy: 0 }),
      ]);
      for (const delivery of simulator.planDeliveries(
        JSON.stringify({ t: "snapshot", snapshot }),
      )) {
        deliveries.push({ timeMs: adjustedTime + delivery.delayMs, snapshot });
      }
    }

    const result = simulateCustomDeliveries({
      deliveries,
      durationMs: 4500,
      frameMs: 1000 / 60,
      entityId: 1,
    });
    expect(result.metrics.largeStepCount).toBeLessThanOrEqual(6);
    expect(result.metrics.jerkP95).toBeLessThanOrEqual(120);
    expect(result.snapshotStats.outOfOrderSnapshotCount).toBeGreaterThanOrEqual(
      0,
    );
  });
});

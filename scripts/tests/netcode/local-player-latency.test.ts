import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { makePlayerSnapshot, makeSnapshot } from "../helpers/snapshotFixtures.ts";

describe("local player latency", () => {
  test("current local player rendering is latency-bound without prediction", () => {
    const serverTickMs = 50;
    const frameMs = 1000 / 60;
    const networkDelayMs = 150;
    const durationMs = 1200;
    const startMoveTick = 4;

    const state = new ClientWorldState(8);
    const interpolator = new Interpolator({
      snapDistance: 192,
      expectedSnapshotMs: serverTickMs,
    });

    const deliveries: Array<{ timeMs: number; snapshot: ReturnType<typeof makeSnapshot> }> = [];
    for (let tick = 1, serverTimeMs = 0; serverTimeMs <= durationMs; tick += 1, serverTimeMs += serverTickMs) {
      const x = tick >= startMoveTick ? (tick - startMoveTick + 1) * 10 : 0;
      const snapshot = makeSnapshot(tick, [
        makePlayerSnapshot(1, x, 0, { vx: 10, vy: 0 }),
      ]);
      deliveries.push({ timeMs: serverTimeMs + networkDelayMs, snapshot });
    }

    let deliveryIndex = 0;
    let firstMotionTime: number | null = null;
    for (let timeMs = 0; timeMs <= durationMs; timeMs += frameMs) {
      while (
        deliveryIndex < deliveries.length &&
        deliveries[deliveryIndex]!.timeMs <= timeMs
      ) {
        const delivery = deliveries[deliveryIndex]!;
        state.pushSnapshot(delivery.snapshot, delivery.timeMs);
        deliveryIndex += 1;
      }
      interpolator.updateInterpolation(state, timeMs, frameMs, 1);
      const frame = interpolator.getLatestDebugFrame();
      const renderedX = frame?.localPlayer?.renderedX ?? 0;
      if (firstMotionTime === null && renderedX > 0.1) {
        firstMotionTime = timeMs;
      }
    }

    expect(firstMotionTime).not.toBeNull();
    const latencyMs = firstMotionTime ?? 0;
    console.log({ latencyMs, networkDelayMs });
    expect(latencyMs).toBeGreaterThan(frameMs);
    expect(latencyMs).toBeGreaterThanOrEqual(networkDelayMs);
  });

  test.todo(
    "Minecraft-style prediction moves local player immediately",
  );
});

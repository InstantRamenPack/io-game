import { describe, expect, test } from "bun:test";
import { DebugNetworkSimulator } from "@client/net/DebugNetworkSimulator.ts";

describe("debug network simulator", () => {
  test("debug network simulation profiles are deterministic", () => {
    const simulator = new DebugNetworkSimulator();
    simulator.configure({ profileName: "perfect", seed: 7, enabled: true });
    const perfectDelays: number[] = [];
    for (let index = 0; index < 300; index += 1) {
      for (const delivery of simulator.planDeliveries(`packet-${index}`)) {
        perfectDelays.push(Math.round(delivery.delayMs));
      }
    }
    const perfectMetrics = simulator.getMetrics();
    expect(perfectMetrics.droppedPacketCount).toBe(0);
    expect(perfectMetrics.duplicatedPacketCount).toBe(0);
    expect(perfectMetrics.reorderedPacketCount).toBe(0);
    expect(perfectDelays.every((delay) => delay === 0)).toBe(true);

    const mildSimulator = new DebugNetworkSimulator();
    mildSimulator.configure({ profileName: "mild", seed: 42, enabled: true });
    const mildDelays: number[] = [];
    for (let index = 0; index < 300; index += 1) {
      for (const delivery of mildSimulator.planDeliveries(`packet-${index}`)) {
        mildDelays.push(Math.round(delivery.delayMs));
      }
    }
    const mildMetrics = mildSimulator.getMetrics();
    expect(mildMetrics.droppedPacketCount).toBeGreaterThan(0);
    expect(mildMetrics.duplicatedPacketCount).toBeGreaterThan(0);
    expect(mildMetrics.reorderedPacketCount).toBeGreaterThan(0);
    expect(mildDelays.every((delay) => delay >= 0 && delay <= 115)).toBe(true);

    const badA = new DebugNetworkSimulator();
    badA.configure({ profileName: "bad", seed: 42, enabled: true });
    const badB = new DebugNetworkSimulator();
    badB.configure({ profileName: "bad", seed: 42, enabled: true });
    const planA = Array.from({ length: 200 }, (_, index) =>
      badA.planDeliveries(`packet-${index}`),
    );
    const planB = Array.from({ length: 200 }, (_, index) =>
      badB.planDeliveries(`packet-${index}`),
    );
    expect(JSON.stringify(planA)).toBe(JSON.stringify(planB));
    const badMetrics = badA.getMetrics();
    expect(badMetrics.droppedPacketCount).toBeGreaterThan(0);
    expect(badMetrics.duplicatedPacketCount).toBeGreaterThan(0);
    expect(badMetrics.reorderedPacketCount).toBeGreaterThan(0);
  });
});

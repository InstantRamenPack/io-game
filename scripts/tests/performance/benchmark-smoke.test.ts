import { beforeAll, describe, expect, test } from "bun:test";
import {
  bootstrapBenchmarks,
  connectClients,
  driveClients,
  makeRuntime,
  measureTicks,
  spawnEnemyGrid,
  spawnProjectileBurst,
  spawnWalls,
  summarizeWorldTicks,
  warmup,
} from "@benchmarks/common.ts";
import {
  expectAllEntityPositionsFinite,
  expectNoDynamicEntityOutsideWorld,
  expectNoDynamicStaticOverlap,
} from "@tests/helpers/collisionExpectations.ts";

describe("benchmark smoke", () => {
  beforeAll(bootstrapBenchmarks);

  test("collision smoke run stays within loose thresholds", () => {
    const { runtime, sink } = makeRuntime({ interestRadius: 900 });
    const clients = connectClients(runtime, 2, "clustered");
    spawnWalls(runtime, 20, { spacing: 24 });
    spawnEnemyGrid(runtime, 15, "police", { spacing: 24 });
    spawnProjectileBurst(runtime, clients[0]!.playerId, 8, "basic");

    warmup(runtime, 4);
    expectAllEntityPositionsFinite(runtime.world);
    expectNoDynamicEntityOutsideWorld(runtime.world);
    expectNoDynamicStaticOverlap(runtime.world);
    sink.reset();

    const rate = measureTicks(runtime, 12, {
      targetTps: 50,
      beforeTick: (tick) => {
        driveClients(runtime, clients, tick);
        if (tick % 4 === 0) {
          spawnProjectileBurst(runtime, clients[0]!.playerId, 4, "basic");
        }
      },
    });

    const world = summarizeWorldTicks(sink.ticks);
    expect(rate.average).toBeLessThan(200);
    expect(world.collision.p99).toBeLessThan(200);
    expectAllEntityPositionsFinite(runtime.world);
    expectNoDynamicEntityOutsideWorld(runtime.world);
    expectNoDynamicStaticOverlap(runtime.world);
  });
});

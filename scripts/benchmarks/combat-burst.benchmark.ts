import {
  bootstrapBenchmarks,
  connectClients,
  driveClients,
  failOnThresholds,
  makeRuntime,
  measureTicks,
  printBenchmarkResult,
  readPositiveInt,
  readPositiveNumber,
  spawnEnemyGrid,
  spawnProjectileBurst,
  spawnWalls,
  summarizeSnapshots,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
  type ProjectileName,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const ENEMIES = readPositiveInt("BENCH_COMBAT_ENEMIES", 260);
const WALLS = readPositiveInt("BENCH_COMBAT_WALLS", 140);
const BURST_SIZE = readPositiveInt("BENCH_COMBAT_BURST_SIZE", 80);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 30);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 180);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 50);
const projectileCycle: ProjectileName[] = [
  "basic",
  "rifle",
  "sniper",
  "cannon",
  "crossbow",
  "drone",
];

const { runtime, network, sink } = makeRuntime({ interestRadius: 1300 });
const clients = connectClients(runtime, 6, "clustered");
spawnEnemyGrid(runtime, ENEMIES, "shoota", { spacing: 30 });
spawnWalls(runtime, WALLS, { spacing: 22 });

warmup(runtime, WARMUP_TICKS);
network.reset();
sink.reset();

const server = measureTicks(runtime, SAMPLE_TICKS, {
  targetTps: TARGET_TPS,
  beforeTick: (tick) => {
    driveClients(runtime, clients, tick);
    if (tick % 12 === 0) {
      const projectileName =
        projectileCycle[(tick / 12) % projectileCycle.length]!;
      spawnProjectileBurst(
        runtime,
        clients[0]!.playerId,
        BURST_SIZE,
        projectileName,
      );
    }
  },
});
const world = summarizeWorldTicks(sink.ticks);
const net = summarizeSnapshots(network);
const metrics = {
  serverAverageMs: server.average,
  serverP95Ms: server.p95,
  serverP99Ms: server.p99,
  entityTickP95Ms: world.entityTick.p95,
  collisionP95Ms: world.collision.p95,
  networkP95Bytes: net.p95Bytes,
};
const thresholds = {
  serverP95Ms: readPositiveNumber(
    "BENCH_COMBAT_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  serverAverageMs: readPositiveNumber(
    "BENCH_COMBAT_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  serverP99Ms: readPositiveNumber("BENCH_COMBAT_MAX_SERVER_P99_MS", 110),
  entityTickP95Ms: readPositiveNumber("BENCH_COMBAT_MAX_ENTITY_P95_MS", 45),
  collisionP95Ms: readPositiveNumber("BENCH_COMBAT_MAX_COLLISION_P95_MS", 24),
  networkP95Bytes: readPositiveNumber(
    "BENCH_COMBAT_MAX_NETWORK_P95_BYTES",
    120_000,
  ),
};

const reportPath = writeBenchmarkReport("combat-burst", {
  scenario: { enemies: ENEMIES, walls: WALLS, burstSize: BURST_SIZE },
  server,
  world,
  network: net,
  metrics,
  thresholds,
});
printBenchmarkResult({ name: "combat-burst", metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

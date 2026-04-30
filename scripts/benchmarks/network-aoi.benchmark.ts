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
  spawnWalls,
  summarizeSnapshots,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const CLIENTS = readPositiveInt("BENCH_NETWORK_CLIENTS", 32);
const ENEMIES = readPositiveInt("BENCH_NETWORK_ENEMIES", 260);
const WALLS = readPositiveInt("BENCH_NETWORK_WALLS", 160);
const INTEREST_RADIUS = readPositiveInt("BENCH_NETWORK_INTEREST_RADIUS", 520);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 40);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 180);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 20);

const { runtime, network, sink } = makeRuntime({
  interestRadius: INTEREST_RADIUS,
});
const clients = connectClients(runtime, CLIENTS, "spread");
spawnEnemyGrid(runtime, ENEMIES, "police", { spacing: 34 });
spawnWalls(runtime, WALLS, {
  centerY: runtime.world.gameConfig.worldSize.h / 2 + 720,
  spacing: 22,
});

warmup(runtime, WARMUP_TICKS);
network.reset();
sink.reset();

const server = measureTicks(runtime, SAMPLE_TICKS, {
  targetTps: TARGET_TPS,
  beforeTick: (tick) => driveClients(runtime, clients, tick),
});
const networkSummary = summarizeSnapshots(network);
const world = summarizeWorldTicks(sink.ticks);

const metrics = {
  serverP95Ms: server.p95,
  serverP99Ms: server.p99,
  networkP95Bytes: networkSummary.p95Bytes,
  networkMaxBytes: networkSummary.maxBytes,
  networkAverageEntities: networkSummary.averageEntities,
  fullSnapshotRatio:
    networkSummary.snapshots > 0
      ? networkSummary.fullSnapshots / networkSummary.snapshots
      : 0,
  snapshotFanout: networkSummary.snapshots,
  snapshotAndWorldP95Ms: world.worldStep.p95,
};
const thresholds = {
  serverP95Ms: readPositiveNumber("BENCH_NETWORK_MAX_SERVER_P95_MS", 50),
  serverP99Ms: readPositiveNumber("BENCH_NETWORK_MAX_SERVER_P99_MS", 75),
  networkP95Bytes: readPositiveNumber("BENCH_NETWORK_MAX_P95_BYTES", 90_000),
  networkMaxBytes: readPositiveNumber("BENCH_NETWORK_MAX_BYTES", 180_000),
  fullSnapshotRatio: readPositiveNumber("BENCH_NETWORK_MAX_FULL_RATIO", 0.12),
  snapshotAndWorldP95Ms: readPositiveNumber(
    "BENCH_NETWORK_MAX_WORLD_P95_MS",
    40,
  ),
};

const reportPath = writeBenchmarkReport("network-aoi", {
  scenario: {
    clients: CLIENTS,
    enemies: ENEMIES,
    walls: WALLS,
    interestRadius: INTEREST_RADIUS,
  },
  server,
  network: networkSummary,
  world,
  metrics,
  thresholds,
});
printBenchmarkResult({ name: "network-aoi", metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

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

const CLIENT_COUNTS = (process.env.BENCH_SCALE_CLIENTS ?? "8,16,32,64")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const ENEMIES = readPositiveInt("BENCH_SCALE_ENEMIES", 240);
const WALLS = readPositiveInt("BENCH_SCALE_WALLS", 180);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 30);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 150);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 20);

const reports = [];
const metrics: Record<string, number> = {};

for (const clientCount of CLIENT_COUNTS) {
  const { runtime, network, sink } = makeRuntime({ interestRadius: 720 });
  const clients = connectClients(runtime, clientCount, "spread");
  spawnEnemyGrid(runtime, ENEMIES, "drifter", { spacing: 36 });
  spawnWalls(runtime, WALLS, { spacing: 24 });

  warmup(runtime, WARMUP_TICKS);
  network.reset();
  sink.reset();
  const server = measureTicks(runtime, SAMPLE_TICKS, {
    targetTps: TARGET_TPS,
    beforeTick: (tick) => driveClients(runtime, clients, tick),
  });
  const net = summarizeSnapshots(network);
  const world = summarizeWorldTicks(sink.ticks);
  metrics[`${clientCount}.serverP95Ms`] = server.p95;
  metrics[`${clientCount}.avgBytesPerClientTick`] =
    clientCount > 0 && SAMPLE_TICKS > 0
      ? net.totalBytes / clientCount / SAMPLE_TICKS
      : 0;
  metrics[`${clientCount}.worldP95Ms`] = world.worldStep.p95;
  reports.push({ clientCount, server, network: net, world });
}

const maxClientCount = Math.max(...CLIENT_COUNTS);
const thresholds = {
  [`${maxClientCount}.serverP95Ms`]: readPositiveNumber(
    "BENCH_SCALE_MAX_SERVER_P95_MS",
    80,
  ),
  [`${maxClientCount}.avgBytesPerClientTick`]: readPositiveNumber(
    "BENCH_SCALE_MAX_AVG_BYTES_PER_CLIENT_TICK",
    85_000,
  ),
  [`${maxClientCount}.worldP95Ms`]: readPositiveNumber(
    "BENCH_SCALE_MAX_WORLD_P95_MS",
    65,
  ),
};

const reportPath = writeBenchmarkReport("multiplayer-scale", {
  scenario: { clientCounts: CLIENT_COUNTS, enemies: ENEMIES, walls: WALLS },
  reports,
  metrics,
  thresholds,
});
printBenchmarkResult({
  name: "multiplayer-scale",
  metrics,
  thresholds,
  reportPath,
});
failOnThresholds(metrics, thresholds);

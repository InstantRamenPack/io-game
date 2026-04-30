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
  spawnMixedEnemyGrid,
  spawnProjectileBurst,
  spawnWalls,
  summarizeSnapshots,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const CLIENTS = readPositiveInt("BENCH_LONG_CLIENTS", 12);
const ENEMIES = readPositiveInt("BENCH_LONG_ENEMIES", 300);
const WALLS = readPositiveInt("BENCH_LONG_WALLS", 260);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 60);
const SAMPLE_TICKS = readPositiveInt("BENCH_LONG_TICKS", 900);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 20);

const { runtime, network, sink } = makeRuntime({ interestRadius: 1000 });
const clients = connectClients(runtime, CLIENTS, "spread");
spawnMixedEnemyGrid(runtime, ENEMIES, { spacing: 32 });
spawnWalls(runtime, WALLS, { spacing: 22 });

warmup(runtime, WARMUP_TICKS);
network.reset();
sink.reset();
const entityStart = runtime.world.entities.all().length;
const heapStart = process.memoryUsage().heapUsed;

const server = measureTicks(runtime, SAMPLE_TICKS, {
  targetTps: TARGET_TPS,
  beforeTick: (tick) => {
    driveClients(runtime, clients, tick);
    if (tick % 45 === 0) {
      spawnProjectileBurst(
        runtime,
        clients[tick % clients.length]!.playerId,
        36,
        "basic",
      );
    }
  },
});

const heapEnd = process.memoryUsage().heapUsed;
const entityEnd = runtime.world.entities.all().length;
const world = summarizeWorldTicks(sink.ticks);
const net = summarizeSnapshots(network);
const metrics = {
  serverP95Ms: server.p95,
  serverP99Ms: server.p99,
  worldP99Ms: world.worldStep.p99,
  heapGrowthMb: (heapEnd - heapStart) / 1024 / 1024,
  entityGrowth: Math.max(0, entityEnd - entityStart),
  networkMaxBytes: net.maxBytes,
};
const thresholds = {
  serverP95Ms: readPositiveNumber("BENCH_LONG_MAX_SERVER_P95_MS", 70),
  serverP99Ms: readPositiveNumber("BENCH_LONG_MAX_SERVER_P99_MS", 110),
  worldP99Ms: readPositiveNumber("BENCH_LONG_MAX_WORLD_P99_MS", 95),
  heapGrowthMb: readPositiveNumber("BENCH_LONG_MAX_HEAP_GROWTH_MB", 96),
  entityGrowth: readPositiveNumber("BENCH_LONG_MAX_ENTITY_GROWTH", 80),
  networkMaxBytes: readPositiveNumber("BENCH_LONG_MAX_NETWORK_BYTES", 180_000),
};

const reportPath = writeBenchmarkReport("long-run", {
  scenario: {
    clients: CLIENTS,
    enemies: ENEMIES,
    walls: WALLS,
    ticks: SAMPLE_TICKS,
  },
  server,
  world,
  network: net,
  entityStart,
  entityEnd,
  heapStart,
  heapEnd,
  metrics,
  thresholds,
});
printBenchmarkResult({ name: "long-run", metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

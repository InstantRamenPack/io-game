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
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const ENEMIES = readPositiveInt("BENCH_PATH_ENEMIES", 360);
const WALLS = readPositiveInt("BENCH_PATH_WALLS", 720);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 50);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 220);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 100);

const { runtime, sink } = makeRuntime({ interestRadius: 1600 });
const clients = connectClients(runtime, 6, "spread");
spawnWalls(runtime, WALLS, { spacing: 18, dungeon: true });
spawnEnemyGrid(runtime, ENEMIES, "wallbreaker", { spacing: 26 });

warmup(runtime, WARMUP_TICKS);
runtime.world.navPathService.collectAndResetBenchmarkStats();
sink.reset();

const server = measureTicks(runtime, SAMPLE_TICKS, {
  targetTps: TARGET_TPS,
  beforeTick: (tick) => driveClients(runtime, clients, tick),
});
const nav = runtime.world.navPathService.collectAndResetBenchmarkStats();
const world = summarizeWorldTicks(sink.ticks);
const metrics = {
  serverAverageMs: server.average,
  serverP95Ms: server.p95,
  navDirtyP95Ms: world.navDirty.p95,
  pathSearchMs: nav.searchMs,
  averageSearchMs: nav.pathSearches > 0 ? nav.searchMs / nav.pathSearches : 0,
  averageNodesPerSearch:
    nav.pathSearches > 0 ? nav.searchedNodes / nav.pathSearches : 0,
  cacheMissRatio:
    nav.requests > 0 ? (nav.requests - nav.cacheHits) / nav.requests : 0,
  failedSearches: nav.failedSearches,
};
const thresholds = {
  serverP95Ms: readPositiveNumber(
    "BENCH_PATH_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  serverAverageMs: readPositiveNumber(
    "BENCH_PATH_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  navDirtyP95Ms: readPositiveNumber("BENCH_PATH_MAX_NAV_DIRTY_P95_MS", 8),
  averageSearchMs: readPositiveNumber("BENCH_PATH_MAX_AVG_SEARCH_MS", 1.8),
  averageNodesPerSearch: readPositiveNumber("BENCH_PATH_MAX_AVG_NODES", 6500),
  failedSearches: readPositiveNumber("BENCH_PATH_MAX_FAILED_SEARCHES", 40),
};

const reportPath = writeBenchmarkReport("pathfinding", {
  scenario: { enemies: ENEMIES, walls: WALLS },
  server,
  nav,
  world,
  metrics,
  thresholds,
});
printBenchmarkResult({ name: "pathfinding", metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

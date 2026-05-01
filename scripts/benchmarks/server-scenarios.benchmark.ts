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
  spawnMixedEnemyGrid,
  spawnProjectileBurst,
  spawnWalls,
  summarizeSnapshots,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
  type EnemyName,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 40);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 180);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 50);

type Scenario = {
  name: string;
  clients: number;
  enemies: number;
  walls: number;
  enemy: EnemyName | "mixed";
  projectiles?: number;
};

const scenarios: readonly Scenario[] = [
  {
    name: "dense-police",
    clients: 1,
    enemies: 420,
    walls: 0,
    enemy: "police" as EnemyName,
  },
  { name: "mixed-wave", clients: 4, enemies: 360, walls: 80, enemy: "mixed" },
  {
    name: "static-heavy",
    clients: 8,
    enemies: 120,
    walls: 520,
    enemy: "drifter" as EnemyName,
  },
  {
    name: "projectile-heavy",
    clients: 4,
    enemies: 140,
    walls: 80,
    enemy: "shoota" as EnemyName,
    projectiles: 180,
  },
] as const;

const reports = [];
const metrics: Record<string, number> = {};

for (const scenario of scenarios) {
  const { runtime, network, sink } = makeRuntime({ interestRadius: 1200 });
  const clients = connectClients(runtime, scenario.clients, "clustered");
  if (scenario.enemy === "mixed") {
    spawnMixedEnemyGrid(runtime, scenario.enemies, { spacing: 30 });
  } else {
    spawnEnemyGrid(runtime, scenario.enemies, scenario.enemy, { spacing: 30 });
  }
  if (scenario.walls > 0) {
    spawnWalls(runtime, scenario.walls, { spacing: 20 });
  }
  if (scenario.projectiles) {
    spawnProjectileBurst(
      runtime,
      clients[0]!.playerId,
      scenario.projectiles,
      "rifle",
    );
  }

  warmup(runtime, WARMUP_TICKS);
  network.reset();
  sink.reset();
  const server = measureTicks(runtime, SAMPLE_TICKS, {
    targetTps: TARGET_TPS,
    beforeTick: (tick) => driveClients(runtime, clients, tick),
  });
  const world = summarizeWorldTicks(sink.ticks);
  const net = summarizeSnapshots(network);

  metrics[`${scenario.name}.serverP95Ms`] = server.p95;
  metrics[`${scenario.name}.serverAverageMs`] = server.average;
  metrics[`${scenario.name}.worldP95Ms`] = world.worldStep.p95;
  metrics[`${scenario.name}.collisionP95Ms`] = world.collision.p95;
  metrics[`${scenario.name}.enemyP95Ms`] = world.enemyTick.p95;
  reports.push({ scenario, server, world, network: net });
}

const thresholds = {
  "dense-police.serverP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_DENSE_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  "dense-police.serverAverageMs": readPositiveNumber(
    "BENCH_SCENARIOS_DENSE_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  "mixed-wave.serverP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_MIXED_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  "mixed-wave.serverAverageMs": readPositiveNumber(
    "BENCH_SCENARIOS_MIXED_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  "static-heavy.serverP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_STATIC_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  "static-heavy.serverAverageMs": readPositiveNumber(
    "BENCH_SCENARIOS_STATIC_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  "projectile-heavy.serverP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_PROJECTILE_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  "projectile-heavy.serverAverageMs": readPositiveNumber(
    "BENCH_SCENARIOS_PROJECTILE_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  "dense-police.enemyP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_MAX_ENEMY_P95_MS",
    45,
  ),
  "projectile-heavy.collisionP95Ms": readPositiveNumber(
    "BENCH_SCENARIOS_MAX_COLLISION_P95_MS",
    20,
  ),
};

const reportPath = writeBenchmarkReport("server-scenarios", {
  scenarios: reports,
  metrics,
  thresholds,
});
printBenchmarkResult({
  name: "server-scenarios",
  metrics,
  thresholds,
  reportPath,
});
failOnThresholds(metrics, thresholds);

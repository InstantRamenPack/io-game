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
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";

bootstrapBenchmarks();

const WARMUP_TICKS = readPositiveInt("BENCH_TICK_BUDGET_WARMUP_TICKS", 30);
const SAMPLE_TICKS = readPositiveInt("BENCH_TICK_BUDGET_SAMPLE_TICKS", 120);
const MAX_TICK_MS = readPositiveNumber("BENCH_TICK_BUDGET_MAX_MS", 10);

type Scenario = {
  name: string;
  clients: number;
  enemies: number;
  walls: number;
  dungeonWalls?: boolean;
  projectiles?: number;
  interestRadius: number;
  enemySpacing: number;
  wallSpacing: number;
};

const scenarios: readonly Scenario[] = [
  {
    name: "dungeon-heavy",
    clients: 4,
    enemies: 70,
    walls: 320,
    dungeonWalls: true,
    interestRadius: 900,
    enemySpacing: 58,
    wallSpacing: 34,
  },
  {
    name: "mixed-combat",
    clients: 4,
    enemies: 140,
    walls: 80,
    interestRadius: 900,
    enemySpacing: 58,
    wallSpacing: 36,
  },
  {
    name: "projectile-combat",
    clients: 4,
    enemies: 90,
    walls: 60,
    projectiles: 120,
    interestRadius: 900,
    enemySpacing: 56,
    wallSpacing: 36,
  },
] as const;

const metrics: Record<string, number> = {};
const thresholds: Record<string, number> = {};
const reports = [];

for (const scenario of scenarios) {
  const { runtime, sink } = makeRuntime({
    interestRadius: scenario.interestRadius,
  });
  const clients = connectClients(runtime, scenario.clients, "clustered");
  const centerX = runtime.world.gameConfig.worldSize.w / 2;
  const centerY = runtime.world.gameConfig.worldSize.h / 2;
  spawnMixedEnemyGrid(runtime, scenario.enemies, {
    centerX,
    centerY,
    spacing: scenario.enemySpacing,
  });
  spawnWalls(runtime, scenario.walls, {
    centerX: centerX + 160,
    centerY: centerY + 160,
    spacing: scenario.wallSpacing,
    dungeon: scenario.dungeonWalls ?? false,
  });
  if (scenario.projectiles) {
    spawnProjectileBurst(
      runtime,
      clients[0]!.playerId,
      scenario.projectiles,
      "rifle",
      {
        centerX,
        centerY,
        radius: 96,
      },
    );
  }

  warmup(runtime, WARMUP_TICKS);
  sink.reset();
  const server = measureTicks(runtime, SAMPLE_TICKS, {
    targetTps: 100,
    beforeTick: (tick) => driveClients(runtime, clients, tick),
  });
  const world = summarizeWorldTicks(sink.ticks);
  metrics[`${scenario.name}.serverAverageMs`] = server.average;
  metrics[`${scenario.name}.serverP95Ms`] = server.p95;
  metrics[`${scenario.name}.serverP99Ms`] = server.p99;
  metrics[`${scenario.name}.serverMaxMs`] = server.max;
  metrics[`${scenario.name}.worldP95Ms`] = world.worldStep.p95;
  metrics[`${scenario.name}.collisionP95Ms`] = world.collision.p95;
  metrics[`${scenario.name}.enemyP95Ms`] = world.enemyTick.p95;
  thresholds[`${scenario.name}.serverAverageMs`] = MAX_TICK_MS;
  thresholds[`${scenario.name}.serverP95Ms`] = MAX_TICK_MS;
  thresholds[`${scenario.name}.serverP99Ms`] = MAX_TICK_MS;
  thresholds[`${scenario.name}.serverMaxMs`] = MAX_TICK_MS;
  thresholds[`${scenario.name}.worldP95Ms`] = MAX_TICK_MS;
  reports.push({ scenario, server, world });
}

const reportPath = writeBenchmarkReport("server-tick-budget", {
  scenario: {
    warmupTicks: WARMUP_TICKS,
    sampleTicks: SAMPLE_TICKS,
    maxTickMs: MAX_TICK_MS,
  },
  scenarios: reports,
  metrics,
  thresholds,
});
printBenchmarkResult({
  name: "server-tick-budget",
  metrics,
  thresholds,
  reportPath,
});
failOnThresholds(metrics, thresholds);

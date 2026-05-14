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
  spawnWalls,
  summarizeRateSamples,
  summarizeSnapshots,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";
import { countVisibilityShadowPolygonsForBenchmark } from "@client/render/pixi/PixiLightsOutOverlay.ts";
import type {
  LightsOutVisibilityContext,
  VisibilityBlockerShape,
} from "@client/render/renderTypes.ts";

bootstrapBenchmarks();

const WARMUP_TICKS = readPositiveInt("BENCH_BUDGET_WARMUP_TICKS", 40);
const SAMPLE_TICKS = readPositiveInt("BENCH_BUDGET_SAMPLE_TICKS", 120);
const CLIENTS = readPositiveInt("BENCH_BUDGET_CLIENTS", 4);
const ENEMIES = readPositiveInt("BENCH_BUDGET_ENEMIES", 180);
const DUNGEON_WALLS = readPositiveInt("BENCH_BUDGET_DUNGEON_WALLS", 320);
const TARGET_TPS = readPositiveNumber("BENCH_BUDGET_TARGET_TPS", 20);
const MAX_NETWORK_MBPS = readPositiveNumber("BENCH_BUDGET_MAX_MBPS", 2);
const MAX_RENDER_FPS = readPositiveNumber("BENCH_BUDGET_MAX_RENDER_FPS", 480);
const MAX_SERVER_TPS = readPositiveNumber("BENCH_BUDGET_MAX_SERVER_TPS", 100);
const RENDER_SAMPLES = readPositiveInt("BENCH_BUDGET_RENDER_SAMPLES", 120);
const RENDER_BLOCKERS = readPositiveInt("BENCH_BUDGET_RENDER_BLOCKERS", 900);
const RENDER_RECTS_PER_BLOCKER = readPositiveInt(
  "BENCH_BUDGET_RENDER_RECTS_PER_BLOCKER",
  3,
);

const { runtime, network, sink } = makeRuntime({ interestRadius: 960 });
const clients = connectClients(runtime, CLIENTS, "clustered");
const centerX = runtime.world.gameConfig.worldSize.w / 2;
const centerY = runtime.world.gameConfig.worldSize.h / 2;
spawnMixedEnemyGrid(runtime, ENEMIES, {
  centerX,
  centerY,
  spacing: 32,
});
spawnWalls(runtime, DUNGEON_WALLS, {
  centerX: centerX + 160,
  centerY: centerY + 160,
  spacing: 18,
  dungeon: true,
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
const render = measureShadowBlockerBudget();
const snapshotRate = TARGET_TPS;

const metrics = {
  networkP95Mbps: bytesPerSnapshotToMbps(networkSummary.p95Bytes, snapshotRate),
  networkMaxMbps: bytesPerSnapshotToMbps(networkSummary.maxBytes, snapshotRate),
  renderP95Ms: render.p95,
  renderP99Ms: render.p99,
  serverConfiguredTps: runtime.world.gameConfig.tickRate,
  serverAverageMs: server.average,
};
const thresholds = {
  networkP95Mbps: MAX_NETWORK_MBPS,
  networkMaxMbps: MAX_NETWORK_MBPS,
  renderP95Ms: 1000 / MAX_RENDER_FPS,
  renderP99Ms: 1000 / MAX_RENDER_FPS,
  serverConfiguredTps: MAX_SERVER_TPS,
};

const reportPath = writeBenchmarkReport("performance-budget", {
  scenario: {
    clients: CLIENTS,
    enemies: ENEMIES,
    dungeonWalls: DUNGEON_WALLS,
    renderBlockers: RENDER_BLOCKERS,
    renderRectsPerBlocker: RENDER_RECTS_PER_BLOCKER,
    targetTps: TARGET_TPS,
  },
  server,
  network: networkSummary,
  world,
  render,
  metrics,
  thresholds,
});
printBenchmarkResult({
  name: "performance-budget",
  metrics,
  thresholds,
  reportPath,
});
failOnThresholds(metrics, thresholds);

function bytesPerSnapshotToMbps(bytes: number, tickRate: number): number {
  return (bytes * tickRate * 8) / 1_000_000;
}

function measureShadowBlockerBudget() {
  const visibility: LightsOutVisibilityContext = {
    center: { x: 0, y: 0 },
    radius: 700,
    restricted: true,
  };
  const blockers = makeShadowBlockers();
  const samples: number[] = [];
  let shadowPolygons = 0;

  const startedAt = performance.now();
  for (let index = 0; index < RENDER_SAMPLES; index += 1) {
    const tickStartedAt = performance.now();
    shadowPolygons = countVisibilityShadowPolygonsForBenchmark(
      visibility,
      blockers,
    );
    samples.push(performance.now() - tickStartedAt);
  }

  return {
    ...summarizeRateSamples(samples, performance.now() - startedAt, 480),
    blockers: blockers.length,
    shadowPolygons,
  };
}

function makeShadowBlockers(): VisibilityBlockerShape[] {
  const blockers: VisibilityBlockerShape[] = [];
  const columns = Math.ceil(Math.sqrt(RENDER_BLOCKERS));
  const spacing = 28;
  for (let index = 0; index < RENDER_BLOCKERS; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const baseX = (column - (columns - 1) / 2) * spacing;
    const baseY = (row - (columns - 1) / 2) * spacing;
    blockers.push({
      kind: "rects",
      sourceEntityId: index + 1,
      rects: Array.from({ length: RENDER_RECTS_PER_BLOCKER }, (_, rect) => {
        const offset = rect * 7;
        return {
          minX: baseX + offset,
          minY: baseY - offset,
          maxX: baseX + offset + 18,
          maxY: baseY - offset + 18,
        };
      }),
    });
  }
  return blockers;
}

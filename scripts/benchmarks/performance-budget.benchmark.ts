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
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { collectVisibilityBlockers } from "@client/net/presentation/PixiWorldPresentationSink.ts";
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
const DISPLAY_FRAMES_PER_SNAPSHOT = readPositiveInt(
  "BENCH_BUDGET_DISPLAY_FRAMES_PER_SNAPSHOT",
  3,
);
const render = measureShadowBlockerBudget();
const gpuLess = measureVisibilityBlockerPrep();
const clientMetrics = {
  renderP95Ms: render.p95,
  renderP99Ms: render.p99,
  nightRenderPassGain: render.renderPassGain,
  nightRenderPassCostRatio: render.renderPassCostRatio,
  gpuLessVisibilityPrepGain: gpuLess.speedup,
  gpuLessVisibilityPrepCostRatio: gpuLess.costRatio,
};
const clientThresholds = {
  renderP95Ms: 1000 / MAX_RENDER_FPS,
  renderP99Ms: 1000 / MAX_RENDER_FPS,
  nightRenderPassCostRatio: 0.5,
  gpuLessVisibilityPrepCostRatio: 0.5,
};

if (process.env.BENCH_BUDGET_CLIENT_ONLY === "1") {
  const reportPath = writeBenchmarkReport("client-performance-budget", {
    scenario: {
      renderBlockers: RENDER_BLOCKERS,
      renderRectsPerBlocker: RENDER_RECTS_PER_BLOCKER,
      displayFramesPerSnapshot: DISPLAY_FRAMES_PER_SNAPSHOT,
    },
    render,
    gpuLess,
    metrics: clientMetrics,
    thresholds: clientThresholds,
  });
  printBenchmarkResult({
    name: "client-performance-budget",
    metrics: clientMetrics,
    thresholds: clientThresholds,
    reportPath,
  });
  failOnThresholds(clientMetrics, clientThresholds);
  process.exit(0);
}

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
const snapshotRate = TARGET_TPS;

const metrics = {
  ...clientMetrics,
  networkP95Mbps: bytesPerSnapshotToMbps(networkSummary.p95Bytes, snapshotRate),
  networkMaxMbps: bytesPerSnapshotToMbps(networkSummary.maxBytes, snapshotRate),
  serverConfiguredTps: runtime.world.gameConfig.tickRate,
  serverAverageMs: server.average,
};
const thresholds = {
  ...clientThresholds,
  networkP95Mbps: MAX_NETWORK_MBPS,
  networkMaxMbps: MAX_NETWORK_MBPS,
  serverConfiguredTps: MAX_SERVER_TPS,
};

const reportPath = writeBenchmarkReport("performance-budget", {
  scenario: {
    clients: CLIENTS,
    enemies: ENEMIES,
    dungeonWalls: DUNGEON_WALLS,
    renderBlockers: RENDER_BLOCKERS,
    renderRectsPerBlocker: RENDER_RECTS_PER_BLOCKER,
    displayFramesPerSnapshot: DISPLAY_FRAMES_PER_SNAPSHOT,
    targetTps: TARGET_TPS,
  },
  server,
  network: networkSummary,
  world,
  render,
  gpuLess,
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

  const projectedBlockers = blockers.reduce(
    (count, blocker) =>
      count +
      (countVisibilityShadowPolygonsForBenchmark(visibility, [blocker]) > 0
        ? 1
        : 0),
    0,
  );
  const legacyRenderPasses = projectedBlockers * 2;
  const renderPasses = projectedBlockers > 0 ? 1 : 0;

  return {
    ...summarizeRateSamples(samples, performance.now() - startedAt, 480),
    blockers: blockers.length,
    shadowPolygons,
    legacyRenderPasses,
    renderPasses,
    renderPassGain: legacyRenderPasses / Math.max(1, renderPasses),
    renderPassCostRatio: renderPasses / Math.max(1, legacyRenderPasses),
  };
}

function measureVisibilityBlockerPrep() {
  const entities = makeVisibilityEntities();
  const measure = (refreshEvery: number) => {
    let blockers: VisibilityBlockerShape[] = [];
    let checksum = 0;
    const startedAt = performance.now();
    for (let frame = 0; frame < RENDER_SAMPLES * 7; frame += 1) {
      if (frame % refreshEvery === 0) {
        blockers = collectVisibilityBlockers(entities);
      }
      checksum += blockers.length;
    }
    return { elapsedMs: performance.now() - startedAt, checksum };
  };

  measure(1);
  measure(DISPLAY_FRAMES_PER_SNAPSHOT);
  const current = measure(DISPLAY_FRAMES_PER_SNAPSHOT);
  const baseline = measure(1);
  if (baseline.checksum !== current.checksum) {
    throw new Error("visibility blocker cache changed benchmark output");
  }

  return {
    entities: entities.length,
    displayFramesPerSnapshot: DISPLAY_FRAMES_PER_SNAPSHOT,
    baselineMs: baseline.elapsedMs,
    currentMs: current.elapsedMs,
    speedup: baseline.elapsedMs / current.elapsedMs,
    costRatio: current.elapsedMs / baseline.elapsedMs,
  };
}

function makeVisibilityEntities(): ClientEntity[] {
  return Array.from(
    { length: RENDER_BLOCKERS },
    (_, index) =>
      new ClientEntity(
        {
          id: index + 1,
          kind: "building",
          typeId: "building:wall",
          x: index,
          y: index,
          vx: 0,
          vy: 0,
          rotation: 0,
          hitboxes: Array.from(
            { length: RENDER_RECTS_PER_BLOCKER },
            (_, rect) => ({
              width: 18,
              height: 18,
              offsetX: rect * 7,
              offsetY: rect * -7,
            }),
          ),
          hp: 100,
          maxHp: 100,
          alive: true,
          label: "Wall",
          tier: 1,
        },
        1,
        4,
      ),
  );
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

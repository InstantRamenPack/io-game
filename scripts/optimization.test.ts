import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { ServerToClientMessage } from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Bomber } from "@server/entities/enemies/Bomber.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import type {
  WorldBenchmarkSink,
  WorldBenchmarkTickStats,
} from "@server/world/World.ts";
import type { NavPathBenchmarkStats } from "@server/world/NavGridPathService.ts";

type CliOptions = {
  jsonPath?: string;
  markdownPath?: string;
  comparePath?: string;
};

type SampleSummary = {
  count: number;
  total: number;
  average: number;
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
};

type RateSummary = SampleSummary & {
  hz: number;
  budgetMs: number;
  stableRatio: number;
};

type NetworkSummary = {
  snapshots: number;
  fullSnapshots: number;
  deltaSnapshots: number;
  totalBytes: number;
  averageBytes: number;
  p95Bytes: number;
  maxBytes: number;
  totalEntities: number;
  averageEntities: number;
  p95Entities: number;
  maxEntities: number;
  totalRemovedEntityIds: number;
};

type ServerTickMeasurement = {
  summary: RateSummary;
  samples: readonly number[];
};

type BenchmarkEntityCtor = new (id: number) => Entity;

type BenchmarkReport = {
  schemaVersion: 1;
  name: string;
  createdAt: string;
  config: {
    spawnedEntity: string;
    spawnedEntityCount: number;
    warmupTicks: number;
    sampleTicks: number;
    targetTps: number;
    targetFps: number;
    frameHistoryLimit: number;
    worldSize: { w: number; h: number };
  };
  scenario: {
    description: string;
    playerId: number;
    entityCount: number;
    enemyCount: number;
  };
  server: {
    tick: RateSummary;
    worldStep: SampleSummary;
    entityTick: SampleSummary;
    enemyTick: SampleSummary;
    collision: SampleSummary;
    navDirty: SampleSummary;
    snapshotAndSend: SampleSummary;
  };
  pathfinding: NavPathBenchmarkStats & {
    cacheHitRatio: number;
    averageSearchMs: number;
    averageNodesPerSearch: number;
  };
  client: {
    frame: RateSummary;
    simulatedFrames: number;
  };
  network: NetworkSummary;
  comparison?: ComparisonReport;
};

type ComparisonReport = {
  baselinePath: string;
  metrics: Array<{
    metric: string;
    current: number;
    baseline: number;
    delta: number;
    deltaPercent: number;
    direction: "higher-is-better" | "lower-is-better";
  }>;
};

const ENTITY_COUNT = readPositiveInt(
  "OPT_ENTITY_COUNT",
  readPositiveInt("OPT_POLICE_COUNT", 500),
);
const ENTITY_NAME = readString("OPT_ENTITY", "police");
const WARMUP_TICKS = readPositiveInt("OPT_WARMUP_TICKS", 60);
const SAMPLE_TICKS = readPositiveInt("OPT_SAMPLE_TICKS", 300);
const TARGET_TPS = readPositiveNumber("OPT_TARGET_TPS", 20);
const TARGET_FPS = readPositiveNumber("OPT_TARGET_FPS", 60);
const FRAME_HISTORY_LIMIT = readPositiveInt("OPT_FRAME_HISTORY_LIMIT", 8);
const DEFAULT_REPORT_DIR = "benchmark-results";
const BENCHMARK_ENTITY_CTORS: ReadonlyMap<string, BenchmarkEntityCtor> =
  new Map<string, BenchmarkEntityCtor>([
    ["bomber", Bomber],
    ["drifter", Drifter],
    ["megaknight", Megaknight],
    ["police", Police],
    ["saboteur", Saboteur],
    ["shoota", Shoota],
    ["wallbreaker", Wallbreaker],
  ]);
const ENTITY_CTOR = resolveBenchmarkEntityCtor(ENTITY_NAME);
const BENCHMARK_NAME = `optimization-${ENTITY_COUNT}-${ENTITY_NAME}`;

class CapturingNetworkServer implements NetworkServerLike {
  public readonly snapshots: WorldSnapshot[] = [];
  public readonly snapshotBytes: number[] = [];

  public onOpen(): void {}
  public onMessage(): void {}
  public onClose(): void {}

  public send(_clientId: string, data: string | Uint8Array): void {
    if (typeof data !== "string") {
      return;
    }
    const message = JSON.parse(data) as ServerToClientMessage;
    if (message.t === "snapshot") {
      this.snapshots.push(message.snapshot);
      this.snapshotBytes.push(Buffer.byteLength(data, "utf8"));
    }
  }

  public broadcast(): void {}
  public disconnect(): void {}
}

class BenchmarkWorldSink implements WorldBenchmarkSink {
  public readonly ticks: WorldBenchmarkTickStats[] = [];

  public recordWorldTick(stats: WorldBenchmarkTickStats): void {
    this.ticks.push(stats);
  }

  public reset(): void {
    this.ticks.length = 0;
  }
}

const cli = parseCliOptions(process.argv.slice(2));

bootstrapTypeRegistries();

const networkServer = new CapturingNetworkServer();
const config = makeConfig();
const runtime = new GameInstanceRuntime(config, networkServer);
const worldSink = new BenchmarkWorldSink();
runtime.world.benchmarkSink = worldSink;
runtime.world.navPathService.benchmarkEnabled = true;
const playerId = runtime.connectReadyClient(
  "optimization-client",
  "optimization-test",
);
spawnBenchmarkEntities(runtime, ENTITY_CTOR, ENTITY_COUNT);

console.log(
  [
    `optimization benchmark: ${BENCHMARK_NAME}`,
    `entity=${ENTITY_NAME}`,
    `entityCount=${ENTITY_COUNT}`,
    `warmupTicks=${WARMUP_TICKS}`,
    `sampleTicks=${SAMPLE_TICKS}`,
  ].join(" "),
);

const serverTick = measureServerTicks(runtime, networkServer, worldSink);
const navStats = runtime.world.navPathService.collectAndResetBenchmarkStats();
const clientFrame = measureClientFrames(networkServer.snapshots);

const report: BenchmarkReport = {
  schemaVersion: 1,
  name: BENCHMARK_NAME,
  createdAt: new Date().toISOString(),
  config: {
    spawnedEntity: ENTITY_NAME,
    spawnedEntityCount: ENTITY_COUNT,
    warmupTicks: WARMUP_TICKS,
    sampleTicks: SAMPLE_TICKS,
    targetTps: TARGET_TPS,
    targetFps: TARGET_FPS,
    frameHistoryLimit: FRAME_HISTORY_LIMIT,
    worldSize: config.worldSize,
  },
  scenario: {
    description: `One player at world center with ${ENTITY_COUNT} ${ENTITY_NAME} entities spawned on a deterministic grid, forcing dense enemy targeting, movement, collision, snapshot, and headless client interpolation pressure.`,
    playerId,
    entityCount: runtime.world.entities.all().length,
    enemyCount: runtime.world.entities
      .all()
      .filter((entity) => entity.typeId.startsWith("enemy:")).length,
  },
  server: summarizeServer(serverTick, worldSink.ticks),
  pathfinding: summarizePathfinding(navStats),
  client: {
    frame: clientFrame,
    simulatedFrames: clientFrame.count,
  },
  network: summarizeNetwork(networkServer),
};

if (cli.comparePath) {
  report.comparison = compareReports(resolve(cli.comparePath), report);
}

printReport(report);

const jsonPath = cli.jsonPath ?? defaultJsonPath(report);
writeTextFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote json=${jsonPath}`);

if (cli.markdownPath) {
  writeTextFile(cli.markdownPath, renderMarkdown(report));
  console.log(`wrote markdown=${cli.markdownPath}`);
}

function makeConfig(): GameConfig {
  const nextConfig = new GameConfig();
  nextConfig.debug.spawnMultiplier = 0;
  nextConfig.replication.interestRadius = Math.max(
    nextConfig.worldSize.w,
    nextConfig.worldSize.h,
  );
  nextConfig.interpolation.historySize = FRAME_HISTORY_LIMIT;
  return nextConfig;
}

function spawnBenchmarkEntities(
  runtime: GameInstanceRuntime,
  EntityCtor: BenchmarkEntityCtor,
  count: number,
): void {
  const centerX = runtime.world.gameConfig.worldSize.w / 2;
  const centerY = runtime.world.gameConfig.worldSize.h / 2;
  const spacing = 20;
  const columns = Math.ceil(Math.sqrt(count));

  for (let index = 0; index < count; index += 1) {
    const entity = new EntityCtor(runtime.world.allocEntityId());
    const row = Math.floor(index / columns);
    const column = index % columns;
    entity.x = centerX + (column - (columns - 1) / 2) * spacing;
    entity.y = centerY + (row - (columns - 1) / 2) * spacing;
    runtime.world.spawn(entity);
  }
}

function measureServerTicks(
  runtime: GameInstanceRuntime,
  networkServer: CapturingNetworkServer,
  worldSink: BenchmarkWorldSink,
): ServerTickMeasurement {
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    runtime.tick();
  }
  networkServer.snapshots.length = 0;
  networkServer.snapshotBytes.length = 0;
  runtime.world.navPathService.collectAndResetBenchmarkStats();
  worldSink.reset();

  const samples: number[] = [];
  const startedAt = performance.now();
  for (let index = 0; index < SAMPLE_TICKS; index += 1) {
    const tickStartedAt = performance.now();
    runtime.tick();
    samples.push(performance.now() - tickStartedAt);
  }
  return {
    summary: summarizeRateSamples(
      samples,
      performance.now() - startedAt,
      TARGET_TPS,
    ),
    samples,
  };
}

function measureClientFrames(snapshots: readonly WorldSnapshot[]): RateSummary {
  const worldState = new ClientWorldState(FRAME_HISTORY_LIMIT);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 1000 / TARGET_TPS,
    maxDebugLogEntries: SAMPLE_TICKS * 4,
  });
  const frameDeltaMs = 1000 / TARGET_FPS;
  const samples: number[] = [];
  let frameTimeMs = 0;

  const startedAt = performance.now();
  for (const snapshot of snapshots) {
    const snapshotTimeMs = snapshot.tick * (1000 / TARGET_TPS);
    worldState.pushSnapshot(snapshot, snapshotTimeMs);

    const nextSnapshotTimeMs = snapshotTimeMs + 1000 / TARGET_TPS;
    while (frameTimeMs < nextSnapshotTimeMs) {
      const frameStartedAt = performance.now();
      interpolator.updateInterpolation(
        worldState,
        frameTimeMs,
        frameDeltaMs,
        snapshot.entities[0]?.id,
      );
      samples.push(performance.now() - frameStartedAt);
      frameTimeMs += frameDeltaMs;
    }
  }

  return summarizeRateSamples(
    samples,
    performance.now() - startedAt,
    TARGET_FPS,
  );
}

function summarizeServer(
  tick: ServerTickMeasurement,
  worldTicks: readonly WorldBenchmarkTickStats[],
): BenchmarkReport["server"] {
  const worldStep = summarizeSamples(
    worldTicks.map((sample) => sample.totalMs),
  );
  const snapshotAndSendSamples = worldTicks.map((sample, index) =>
    Math.max(0, (tick.samples[index] ?? 0) - sample.totalMs),
  );
  return {
    tick: tick.summary,
    worldStep,
    entityTick: summarizeSamples(
      worldTicks.map((sample) => sample.entityTickMs),
    ),
    enemyTick: summarizeSamples(worldTicks.map((sample) => sample.enemyTickMs)),
    collision: summarizeSamples(worldTicks.map((sample) => sample.collisionMs)),
    navDirty: summarizeSamples(worldTicks.map((sample) => sample.navDirtyMs)),
    snapshotAndSend: summarizeSamples(snapshotAndSendSamples),
  };
}

function summarizePathfinding(
  stats: NavPathBenchmarkStats,
): BenchmarkReport["pathfinding"] {
  return {
    ...stats,
    cacheHitRatio: stats.requests > 0 ? stats.cacheHits / stats.requests : 0,
    averageSearchMs:
      stats.pathSearches > 0 ? stats.searchMs / stats.pathSearches : 0,
    averageNodesPerSearch:
      stats.pathSearches > 0 ? stats.searchedNodes / stats.pathSearches : 0,
  };
}

function summarizeNetwork(
  networkServer: CapturingNetworkServer,
): NetworkSummary {
  const entityCounts = networkServer.snapshots.map(
    (snapshot) => snapshot.entities.length,
  );
  const removedEntityCounts = networkServer.snapshots.map(
    (snapshot) => snapshot.removedEntityIds?.length ?? 0,
  );
  return {
    snapshots: networkServer.snapshots.length,
    fullSnapshots: networkServer.snapshots.filter(
      (snapshot) => snapshot.full !== false,
    ).length,
    deltaSnapshots: networkServer.snapshots.filter(
      (snapshot) => snapshot.full === false,
    ).length,
    totalBytes: sum(networkServer.snapshotBytes),
    averageBytes: average(networkServer.snapshotBytes),
    p95Bytes: percentile(networkServer.snapshotBytes, 0.95),
    maxBytes: max(networkServer.snapshotBytes),
    totalEntities: sum(entityCounts),
    averageEntities: average(entityCounts),
    p95Entities: percentile(entityCounts, 0.95),
    maxEntities: max(entityCounts),
    totalRemovedEntityIds: sum(removedEntityCounts),
  };
}

function summarizeRateSamples(
  samples: readonly number[],
  totalMs: number,
  targetHz: number,
): RateSummary {
  const summary = summarizeSamples(samples);
  const budgetMs = 1000 / targetHz;
  const stableSamples = samples.filter((sample) => sample <= budgetMs).length;
  return {
    ...summary,
    total: totalMs,
    hz: samples.length / (totalMs / 1000),
    budgetMs,
    stableRatio: samples.length > 0 ? stableSamples / samples.length : 0,
  };
}

function summarizeSamples(samples: readonly number[]): SampleSummary {
  return {
    count: samples.length,
    total: sum(samples),
    average: average(samples),
    min: min(samples),
    p50: percentile(samples, 0.5),
    p90: percentile(samples, 0.9),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: max(samples),
  };
}

function compareReports(
  baselinePath: string,
  current: BenchmarkReport,
): ComparisonReport {
  const baseline = JSON.parse(
    readFileSync(baselinePath, "utf8"),
  ) as BenchmarkReport;
  const metrics: ComparisonReport["metrics"] = [
    compareMetric(
      "server.tick.hz",
      current.server.tick.hz,
      baseline.server.tick.hz,
      "higher-is-better",
    ),
    compareMetric(
      "server.tick.p95Ms",
      current.server.tick.p95,
      baseline.server.tick.p95,
      "lower-is-better",
    ),
    compareMetric(
      "server.enemyTick.p95Ms",
      current.server.enemyTick.p95,
      baseline.server.enemyTick.p95,
      "lower-is-better",
    ),
    compareMetric(
      "pathfinding.searchMs",
      current.pathfinding.searchMs,
      baseline.pathfinding.searchMs,
      "lower-is-better",
    ),
    compareMetric(
      "pathfinding.pathSearches",
      current.pathfinding.pathSearches,
      baseline.pathfinding.pathSearches,
      "lower-is-better",
    ),
    compareMetric(
      "client.frame.hz",
      current.client.frame.hz,
      baseline.client.frame.hz,
      "higher-is-better",
    ),
    compareMetric(
      "network.averageBytes",
      current.network.averageBytes,
      baseline.network.averageBytes,
      "lower-is-better",
    ),
  ];
  return { baselinePath, metrics };
}

function compareMetric(
  metric: string,
  current: number,
  baseline: number,
  direction: "higher-is-better" | "lower-is-better",
): ComparisonReport["metrics"][number] {
  const delta = current - baseline;
  return {
    metric,
    current,
    baseline,
    delta,
    deltaPercent: baseline === 0 ? 0 : delta / baseline,
    direction,
  };
}

function printReport(report: BenchmarkReport): void {
  console.log(
    `server TPS ${format(report.server.tick.hz)} avg=${formatMs(
      report.server.tick.average,
    )} p95=${formatMs(report.server.tick.p95)} stable=${formatPercent(
      report.server.tick.stableRatio,
    )}`,
  );
  console.log(
    `server costs p95 world=${formatMs(
      report.server.worldStep.p95,
    )} enemy=${formatMs(report.server.enemyTick.p95)} collision=${formatMs(
      report.server.collision.p95,
    )} snapshot+send=${formatMs(report.server.snapshotAndSend.p95)}`,
  );
  console.log(
    `pathfinding requests=${report.pathfinding.requests} searches=${report.pathfinding.pathSearches} cacheHit=${formatPercent(
      report.pathfinding.cacheHitRatio,
    )} searchMs=${formatMs(report.pathfinding.searchMs)} nodes=${format(
      report.pathfinding.searchedNodes,
    )}`,
  );
  console.log(
    `client FPS ${format(report.client.frame.hz)} avg=${formatMs(
      report.client.frame.average,
    )} p95=${formatMs(report.client.frame.p95)} stable=${formatPercent(
      report.client.frame.stableRatio,
    )}`,
  );
  console.log(
    `network snapshots=${report.network.snapshots} full=${report.network.fullSnapshots} delta=${report.network.deltaSnapshots} avgBytes=${format(
      report.network.averageBytes,
    )} p95Bytes=${format(report.network.p95Bytes)} avgEntities=${format(
      report.network.averageEntities,
    )}`,
  );
  if (report.comparison) {
    console.log(`comparison baseline=${report.comparison.baselinePath}`);
    for (const metric of report.comparison.metrics) {
      console.log(
        `  ${metric.metric}: current=${format(metric.current)} baseline=${format(
          metric.baseline,
        )} delta=${format(metric.delta)} (${formatPercent(metric.deltaPercent)})`,
      );
    }
  }
}

function renderMarkdown(report: BenchmarkReport): string {
  const rows = [
    ["Server TPS", report.server.tick.hz, "higher"],
    ["Server tick p95 ms", report.server.tick.p95, "lower"],
    ["Enemy tick p95 ms", report.server.enemyTick.p95, "lower"],
    ["Collision p95 ms", report.server.collision.p95, "lower"],
    ["Pathfinding search ms", report.pathfinding.searchMs, "lower"],
    ["Pathfinding searches", report.pathfinding.pathSearches, "lower"],
    ["Client FPS", report.client.frame.hz, "higher"],
    ["Network avg bytes", report.network.averageBytes, "lower"],
  ] as const;
  return [
    `# ${report.name}`,
    "",
    `Created: ${report.createdAt}`,
    "",
    `Scenario: ${report.scenario.description}`,
    "",
    "| Metric | Value | Better |",
    "| --- | ---: | --- |",
    ...rows.map(
      ([label, value, better]) => `| ${label} | ${format(value)} | ${better} |`,
    ),
    "",
  ].join("\n");
}

function parseCliOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--json" && next) {
      options.jsonPath = next;
      index += 1;
    } else if (arg === "--markdown" && next) {
      options.markdownPath = next;
      index += 1;
    } else if (arg === "--compare" && next) {
      options.comparePath = next;
      index += 1;
    }
  }
  return options;
}

function resolveBenchmarkEntityCtor(name: string): BenchmarkEntityCtor {
  const ctor = BENCHMARK_ENTITY_CTORS.get(name);
  if (ctor) {
    return ctor;
  }

  throw new Error(
    `Unsupported OPT_ENTITY=${name}. Supported values: ${[
      ...BENCHMARK_ENTITY_CTORS.keys(),
    ].join(", ")}`,
  );
}

function defaultJsonPath(report: BenchmarkReport): string {
  const timestamp = report.createdAt.replaceAll(":", "-").replaceAll(".", "-");
  return `${DEFAULT_REPORT_DIR}/${report.name}-${timestamp}.json`;
}

function writeTextFile(path: string, text: string): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, text);
}

function readPositiveInt(name: string, fallback: number): number {
  return Math.max(1, Math.floor(readPositiveNumber(name, fallback)));
}

function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function min(values: readonly number[]): number {
  return values.length > 0 ? Math.min(...values) : 0;
}

function max(values: readonly number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

function format(value: number): string {
  return value.toFixed(2);
}

function formatMs(value: number): string {
  return `${format(value)}ms`;
}

function formatPercent(value: number): string {
  return `${format(value * 100)}%`;
}

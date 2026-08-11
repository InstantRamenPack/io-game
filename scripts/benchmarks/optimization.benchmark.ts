import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { parseServerToClientMessage } from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import type {
  WorldBenchmarkSink,
  WorldBenchmarkTickStats,
} from "@server/world/World.ts";
import type { NavPathBenchmarkStats } from "@server/world/NavGridPathService.ts";
import {
  connectClientsAtSectorCenters,
  driveSectorClients,
  readInt,
  readPositiveInt,
  readPositiveNumber,
  spawnLayoutEnemiesMultiplied,
  type BenchmarkClient,
} from "@benchmarks/common.ts";

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

type BenchmarkReport = {
  schemaVersion: 1;
  name: string;
  createdAt: string;
  effectiveTps: number;
  config: {
    worldSeed: number;
    enemyMultiplier: number;
    sectorClientCount: number;
    warmupTicks: number;
    sampleTicks: number;
    targetTps: number;
    targetFps: number;
    frameHistoryLimit: number;
    interestRadius: number;
    worldSize: { w: number; h: number };
  };
  scenario: {
    description: string;
    sectorClientCount: number;
    entityCount: number;
    enemyCount: number;
    layoutEnemySpecCount: number;
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

const WORLD_SEED = readInt("OPT_WORLD_SEED", 1337);
const ENEMY_MULTIPLIER = readPositiveInt("OPT_ENEMY_MULTIPLIER", 5);
const WARMUP_TICKS = readPositiveInt("OPT_WARMUP_TICKS", 60);
const SAMPLE_TICKS = readPositiveInt("OPT_SAMPLE_TICKS", 300);
const TARGET_TPS = readPositiveNumber("OPT_TARGET_TPS", 50);
const TARGET_FPS = readPositiveNumber("OPT_TARGET_FPS", 60);
const FRAME_HISTORY_LIMIT = readPositiveInt("OPT_FRAME_HISTORY_LIMIT", 8);
const DEFAULT_REPORT_DIR = "benchmark-results";
const BENCHMARK_NAME = `optimization-realistic-${WORLD_SEED}`;

class CapturingNetworkServer implements NetworkServerLike {
  public readonly snapshots: WorldSnapshot[] = [];
  public readonly snapshotBytes: number[] = [];
  private readonly rawMessages: Array<string | Uint8Array> = [];
  private parsedSnapshots = false;

  public onOpen(): void {}
  public onMessage(): void {}
  public onClose(): void {}

  public send(_clientId: string, data: string | Uint8Array): void {
    this.snapshotBytes.push(
      typeof data === "string" ? data.length : data.byteLength,
    );
    this.rawMessages.push(data);
    this.parsedSnapshots = false;
  }

  public broadcast(): void {}
  public disconnect(): void {}

  public ensureSnapshotsParsed(): void {
    if (this.parsedSnapshots) {
      return;
    }
    this.snapshots.length = 0;
    for (const data of this.rawMessages) {
      const message = parseServerToClientMessage(data, {
        validateSnapshots: false,
      });
      if (message?.t === "snapshot") {
        this.snapshots.push(message.snapshot);
      }
    }
    this.parsedSnapshots = true;
  }

  public reset(): void {
    this.snapshots.length = 0;
    this.snapshotBytes.length = 0;
    this.rawMessages.length = 0;
    this.parsedSnapshots = false;
  }
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
const runtime = new GameInstanceRuntime(config, networkServer, {
  worldSeed: WORLD_SEED,
});
const worldSink = new BenchmarkWorldSink();
runtime.world.benchmarkSink = worldSink;
runtime.world.navPathService.benchmarkEnabled = true;

const layout = runtime.world.proceduralLayout;
if (!layout) {
  throw new Error("optimization benchmark requires a procedural match layout");
}

const layoutEnemySpecCount = layout.sectors.reduce(
  (total, sector) => total + sector.enemies.length,
  0,
);
spawnLayoutEnemiesMultiplied(runtime, ENEMY_MULTIPLIER);
const sectorClients = connectClientsAtSectorCenters(runtime);

console.log(
  [
    `optimization benchmark: ${BENCHMARK_NAME}`,
    `worldSeed=${WORLD_SEED}`,
    `enemyMultiplier=${ENEMY_MULTIPLIER}`,
    `layoutEnemySpecs=${layoutEnemySpecCount}`,
    `sectorClients=${sectorClients.length}`,
    `warmupTicks=${WARMUP_TICKS}`,
    `sampleTicks=${SAMPLE_TICKS}`,
  ].join(" "),
);

const serverTick = measureServerTicks(
  runtime,
  networkServer,
  worldSink,
  sectorClients,
);
const navStats = runtime.world.navPathService.collectAndResetBenchmarkStats();
networkServer.ensureSnapshotsParsed();
const clientFrame = measureClientFrames(networkServer.snapshots);
const effectiveTps = 1000 / serverTick.summary.average;

const report: BenchmarkReport = {
  schemaVersion: 1,
  name: BENCHMARK_NAME,
  createdAt: new Date().toISOString(),
  effectiveTps,
  config: {
    worldSeed: WORLD_SEED,
    enemyMultiplier: ENEMY_MULTIPLIER,
    sectorClientCount: sectorClients.length,
    warmupTicks: WARMUP_TICKS,
    sampleTicks: SAMPLE_TICKS,
    targetTps: TARGET_TPS,
    targetFps: TARGET_FPS,
    frameHistoryLimit: FRAME_HISTORY_LIMIT,
    interestRadius: config.replication.interestRadius,
    worldSize: config.worldSize,
  },
  scenario: {
    description: `Full procedural match seed ${WORLD_SEED} with each layout enemy at ${ENEMY_MULTIPLIER}x (${ENEMY_MULTIPLIER - 1} jittered copies per spec, including legendary bosses) and ${sectorClients.length} sector-centered clients driving AOI/snapshot pressure.`,
    sectorClientCount: sectorClients.length,
    entityCount: runtime.world.entities.all().length,
    enemyCount: runtime.world.entities
      .all()
      .filter((entity) => entity.typeId.startsWith("enemy:")).length,
    layoutEnemySpecCount,
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

validateReport(report, cli);

if (cli.markdownPath) {
  writeTextFile(cli.markdownPath, renderMarkdown(report));
  console.log(`wrote markdown=${cli.markdownPath}`);
}

function makeConfig(): GameConfig {
  const nextConfig = new GameConfig();
  nextConfig.debug.spawnMultiplier = 0;
  nextConfig.replication.interestRadius = readPositiveNumber(
    "OPT_INTEREST_RADIUS",
    nextConfig.replication.interestRadius,
  );
  nextConfig.interpolation.historySize = FRAME_HISTORY_LIMIT;
  return nextConfig;
}

function measureServerTicks(
  runtime: GameInstanceRuntime,
  networkServer: CapturingNetworkServer,
  worldSink: BenchmarkWorldSink,
  clients: readonly BenchmarkClient[],
): ServerTickMeasurement {
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    driveSectorClients(runtime, clients, index);
    runtime.tick();
  }
  networkServer.reset();
  runtime.world.navPathService.collectAndResetBenchmarkStats();
  worldSink.reset();

  const samples: number[] = [];
  const startedAt = performance.now();
  for (let index = 0; index < SAMPLE_TICKS; index += 1) {
    driveSectorClients(runtime, clients, WARMUP_TICKS + index);
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
  networkServer.ensureSnapshotsParsed();
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
  const baselineEffectiveTps =
    baseline.effectiveTps ?? 1000 / baseline.server.tick.average;
  const metrics: ComparisonReport["metrics"] = [
    compareMetric(
      "effectiveTps",
      current.effectiveTps,
      baselineEffectiveTps,
      "higher-is-better",
    ),
    compareMetric(
      "server.tick.hz",
      current.server.tick.hz,
      baseline.server?.tick?.hz,
      "higher-is-better",
    ),
    compareMetric(
      "server.tick.p95Ms",
      current.server.tick.p95,
      baseline.server?.tick?.p95,
      "lower-is-better",
    ),
    compareMetric(
      "server.enemyTick.p95Ms",
      current.server.enemyTick.p95,
      baseline.server?.enemyTick?.p95,
      "lower-is-better",
    ),
    compareMetric(
      "pathfinding.searchMs",
      current.pathfinding.searchMs,
      baseline.pathfinding?.searchMs,
      "lower-is-better",
    ),
    compareMetric(
      "pathfinding.pathSearches",
      current.pathfinding.pathSearches,
      baseline.pathfinding?.pathSearches,
      "lower-is-better",
    ),
    compareMetric(
      "client.frame.hz",
      current.client.frame.hz,
      baseline.client?.frame?.hz,
      "higher-is-better",
    ),
    compareMetric(
      "network.averageBytes",
      current.network.averageBytes,
      baseline.network?.averageBytes,
      "lower-is-better",
    ),
  ].filter(
    (metric): metric is ComparisonReport["metrics"][number] => metric !== null,
  );
  return { baselinePath, metrics };
}

function compareMetric(
  metric: string,
  current: number,
  baseline: number | undefined,
  direction: "higher-is-better" | "lower-is-better",
): ComparisonReport["metrics"][number] | null {
  if (baseline === undefined || !Number.isFinite(baseline)) {
    return null;
  }
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
    `effective TPS ${format(report.effectiveTps)} (1000 / server avg ${formatMs(
      report.server.tick.average,
    )})`,
  );
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
    ["Effective TPS", report.effectiveTps, "higher"],
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
    } else if (arg === "--comparePath" && next) {
      options.comparePath = next;
      index += 1;
    }
  }
  return options;
}

function validateReport(report: BenchmarkReport, cli: CliOptions): void {
  const expectedSnapshots = SAMPLE_TICKS * report.scenario.sectorClientCount;
  if (
    report.network.snapshots !== expectedSnapshots ||
    report.network.totalBytes <= 0 ||
    report.network.totalEntities <= 0 ||
    report.client.simulatedFrames <= 0
  ) {
    throw new Error(
      `incomplete workload evidence snapshots=${report.network.snapshots}/${expectedSnapshots} bytes=${report.network.totalBytes} entities=${report.network.totalEntities} frames=${report.client.simulatedFrames}`,
    );
  }
  if (cli.comparePath) {
    const baseline = JSON.parse(
      readFileSync(resolve(cli.comparePath), "utf8"),
    ) as BenchmarkReport;
    const baselineEffectiveTps =
      baseline.effectiveTps ?? 1000 / baseline.server.tick.average;
    const requiredTps = baselineEffectiveTps * 2.5;
    if (report.effectiveTps >= requiredTps) {
      console.log(
        `comparison passed effectiveTps=${format(report.effectiveTps)} >= baseline*2.5=${format(requiredTps)}`,
      );
      return;
    }
    throw new Error(
      `effectiveTps=${format(report.effectiveTps)} threshold=${format(requiredTps)} (baseline=${format(baselineEffectiveTps)} * 2.5)`,
    );
  }

  const thresholds = [
    {
      metric: "server.tick.averageMs",
      value: report.server.tick.average,
      threshold: readPositiveNumber("OPT_MAX_SERVER_AVG_MS", 1000 / TARGET_TPS),
    },
    {
      metric: "server.tick.p95Ms",
      value: report.server.tick.p95,
      threshold: readPositiveNumber(
        "OPT_MAX_SERVER_P95_MS",
        (1000 / TARGET_TPS) * 2,
      ),
    },
    {
      metric: "server.worldStep.p95Ms",
      value: report.server.worldStep.p95,
      threshold: readPositiveNumber(
        "OPT_MAX_WORLD_P95_MS",
        (1000 / TARGET_TPS) * 2,
      ),
    },
    {
      metric: "client.frame.p95Ms",
      value: report.client.frame.p95,
      threshold: readPositiveNumber(
        "OPT_MAX_CLIENT_FRAME_P95_MS",
        1000 / TARGET_FPS,
      ),
    },
  ];
  const failures = thresholds.filter(
    ({ value, threshold }) => value > threshold,
  );
  if (failures.length === 0) {
    console.log(
      `thresholds passed serverP95<=${formatMs(
        thresholds[1]!.threshold,
      )} serverAvg<=${formatMs(thresholds[0]!.threshold)} worldP95<=${formatMs(
        thresholds[2]!.threshold,
      )} clientP95<=${formatMs(thresholds[3]!.threshold)}`,
    );
    return;
  }
  throw new Error(
    failures
      .map(
        ({ metric, value, threshold }) =>
          `${metric}=${format(value)} threshold=${format(threshold)}`,
      )
      .join("; "),
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

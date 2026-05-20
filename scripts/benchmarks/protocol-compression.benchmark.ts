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
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";
import {
  getProtocolMetricsSnapshot,
  resetProtocolMetrics,
} from "@shared/net/protocolMetrics.ts";

bootstrapBenchmarks();

const CLIENTS = readPositiveInt("BENCH_PROTOCOL_CLIENTS", 16);
const ENEMIES = readPositiveInt("BENCH_PROTOCOL_ENEMIES", 180);
const WALLS = readPositiveInt("BENCH_PROTOCOL_WALLS", 120);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 20);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 80);

const { runtime, network } = makeRuntime();
const clients = connectClients(runtime, CLIENTS, "spread");
spawnEnemyGrid(runtime, ENEMIES, "police", { spacing: 32 });
spawnWalls(runtime, WALLS, {
  centerY: runtime.world.gameConfig.worldSize.h / 2 + 680,
  spacing: 22,
});

warmup(runtime, WARMUP_TICKS);
network.reset();
resetProtocolMetrics();

measureTicks(runtime, SAMPLE_TICKS, {
  beforeTick: (tick) => driveClients(runtime, clients, tick),
});

const binarySummary = summarizeSnapshots(network);
const jsonBaselineBytes = binarySummary.jsonBaselineTotalBytes;
const binaryBytes = binarySummary.totalBytes;
const bandwidthReduction = binarySummary.bandwidthReduction;
const metricsSnapshot = getProtocolMetricsSnapshot();

const metrics = {
  bandwidthReduction,
  binaryTotalBytes: binaryBytes,
  jsonBaselineBytes,
  serverEncodeP95Ms: metricsSnapshot.server_encode.durationP95Ms,
  binaryP95Bytes: binarySummary.p95Bytes,
};
const thresholds = {
  bandwidthReduction: readPositiveNumber(
    "BENCH_PROTOCOL_MIN_BANDWIDTH_REDUCTION",
    0.5,
  ),
  serverEncodeP95Ms: readPositiveNumber("BENCH_PROTOCOL_MAX_ENCODE_P95_MS", 2),
};

const reportPath = writeBenchmarkReport("protocol-compression", {
  scenario: {
    clients: CLIENTS,
    enemies: ENEMIES,
    walls: WALLS,
  },
  binary: binarySummary,
  protocolMetrics: metricsSnapshot,
  metrics,
  thresholds,
});

printBenchmarkResult({
  name: "protocol-compression",
  metrics,
  thresholds,
  reportPath,
});
failCompressionThresholds(metrics, thresholds);

function failCompressionThresholds(
  metricsToCheck: typeof metrics,
  thresholdsToCheck: typeof thresholds,
): void {
  const inverted = {
    bandwidthReduction: -metricsToCheck.bandwidthReduction,
    serverEncodeP95Ms: metricsToCheck.serverEncodeP95Ms,
  };
  failOnThresholds(inverted, {
    bandwidthReduction: -thresholdsToCheck.bandwidthReduction,
    serverEncodeP95Ms: thresholdsToCheck.serverEncodeP95Ms,
  });
}

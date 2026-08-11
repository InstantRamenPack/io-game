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
  type ProjectileName,
} from "@benchmarks/common.ts";
import {
  assertAllEntityPositionsFinite,
  assertNoDynamicEntityOutsideWorld,
  assertNoDynamicStaticOverlap,
} from "../tests/helpers/collisionInvariants.ts";

type ScenarioName =
  | "collision"
  | "combat-burst"
  | "long-run"
  | "network-aoi"
  | "pathfinding";

type Scenario = {
  name: ScenarioName;
  clients: number;
  enemies: number;
  walls: number;
  interestRadius: number;
  warmupTicks: number;
  sampleTicks: number;
  targetTps: number;
};

const names: readonly ScenarioName[] = [
  "collision",
  "combat-burst",
  "long-run",
  "network-aoi",
  "pathfinding",
];
const requestedName = process.argv[2];
if (!names.includes(requestedName as ScenarioName)) {
  throw new Error(`Expected benchmark scenario: ${names.join(", ")}`);
}
const name = requestedName as ScenarioName;

bootstrapBenchmarks();
const scenario = getScenario(name);
const { runtime, network, sink } = makeRuntime({
  interestRadius: scenario.interestRadius,
});
if (name === "collision") {
  for (const entity of runtime.world.entities.all()) {
    if (
      entity.typeId.startsWith("enemy:") ||
      entity.typeId === "pickup:item_entity"
    ) {
      runtime.world.despawn(entity.id);
    }
  }
}
const clients = connectClients(
  runtime,
  scenario.clients,
  name === "collision" || name === "combat-burst" ? "clustered" : "spread",
);
const centerX = runtime.world.gameConfig.worldSize.w / 2;
const centerY = runtime.world.gameConfig.worldSize.h / 2;

switch (name) {
  case "collision":
    spawnWalls(runtime, scenario.walls, {
      centerX,
      centerY: centerY - 420,
      spacing: 18,
    });
    spawnEnemyGrid(runtime, scenario.enemies, "police", {
      centerX,
      centerY: centerY + 1800,
      spacing: 18,
    });
    spawnProjectileBurst(
      runtime,
      clients[0]!.playerId,
      readPositiveInt("BENCH_COLLISION_PROJECTILES", 120),
      "basic",
    );
    break;
  case "combat-burst":
    spawnEnemyGrid(runtime, scenario.enemies, "shoota", { spacing: 30 });
    spawnWalls(runtime, scenario.walls, { spacing: 22 });
    break;
  case "long-run":
    spawnMixedEnemyGrid(runtime, scenario.enemies, { spacing: 32 });
    spawnWalls(runtime, scenario.walls, { spacing: 22 });
    break;
  case "network-aoi":
    spawnEnemyGrid(runtime, scenario.enemies, "police", { spacing: 34 });
    spawnWalls(runtime, scenario.walls, {
      centerY: centerY + 720,
      spacing: 22,
    });
    break;
  case "pathfinding":
    spawnWalls(runtime, scenario.walls, { spacing: 18, dungeon: true });
    spawnEnemyGrid(runtime, scenario.enemies, "wallbreaker", { spacing: 26 });
    break;
}

warmup(runtime, scenario.warmupTicks);
if (name === "collision") assertCollisionInvariants();
if (name === "pathfinding") {
  runtime.world.navPathService.collectAndResetBenchmarkStats();
}
network.reset();
sink.reset();
const entityStart = runtime.world.entities.all().length;
const heapStart = process.memoryUsage().heapUsed;
const projectileCycle: ProjectileName[] = [
  "basic",
  "rifle",
  "sniper",
  "cannon",
  "crossbow",
  "drone",
];
const server = measureTicks(runtime, scenario.sampleTicks, {
  targetTps: scenario.targetTps,
  beforeTick: (tick) => {
    driveClients(runtime, clients, tick);
    if (name === "collision" && tick % 20 === 0) {
      spawnProjectileBurst(runtime, clients[0]!.playerId, 24, "crossbow");
    } else if (name === "combat-burst" && tick % 12 === 0) {
      spawnProjectileBurst(
        runtime,
        clients[0]!.playerId,
        readPositiveInt("BENCH_COMBAT_BURST_SIZE", 80),
        projectileCycle[(tick / 12) % projectileCycle.length]!,
      );
    } else if (name === "long-run" && tick % 45 === 0) {
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
const networkSummary = summarizeSnapshots(network);
const nav =
  name === "pathfinding"
    ? runtime.world.navPathService.collectAndResetBenchmarkStats()
    : undefined;
if (name === "collision") assertCollisionInvariants();

const metrics = getMetrics();
const thresholds = getThresholds();
const reportPath = writeBenchmarkReport(name, {
  scenario,
  server,
  world,
  network: networkSummary,
  nav,
  entityStart,
  entityEnd,
  heapStart,
  heapEnd,
  metrics,
  thresholds,
});
printBenchmarkResult({ name, metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

function assertCollisionInvariants(): void {
  assertAllEntityPositionsFinite(runtime.world);
  assertNoDynamicEntityOutsideWorld(runtime.world);
  assertNoDynamicStaticOverlap(runtime.world);
}

function getMetrics(): Record<string, number> {
  const common = {
    serverAverageMs: server.average,
    serverP95Ms: server.p95,
  };
  switch (name) {
    case "collision":
      return {
        ...common,
        collisionP95Ms: world.collision.p95,
        collisionP99Ms: world.collision.p99,
        worldP95Ms: world.worldStep.p95,
      };
    case "combat-burst":
      return {
        ...common,
        serverP99Ms: server.p99,
        entityTickP95Ms: world.entityTick.p95,
        collisionP95Ms: world.collision.p95,
        networkP95Bytes: networkSummary.p95Bytes,
      };
    case "long-run":
      return {
        ...common,
        serverP99Ms: server.p99,
        worldP99Ms: world.worldStep.p99,
        heapGrowthMb: (heapEnd - heapStart) / 1024 / 1024,
        entityGrowth: Math.max(0, entityEnd - entityStart),
        networkMaxBytes: networkSummary.maxBytes,
      };
    case "network-aoi":
      return {
        ...common,
        serverP99Ms: server.p99,
        networkP95Bytes: networkSummary.p95Bytes,
        networkMaxBytes: networkSummary.maxBytes,
        networkAverageEntities: networkSummary.averageEntities,
        fullSnapshotRatio:
          networkSummary.snapshots > 0
            ? networkSummary.fullSnapshots / networkSummary.snapshots
            : 0,
        snapshotFanout: networkSummary.snapshots,
        snapshotAndWorldP95Ms: world.worldStep.p95,
      };
    case "pathfinding":
      return {
        ...common,
        navDirtyP95Ms: world.navDirty.p95,
        pathSearchMs: nav!.searchMs,
        averageSearchMs:
          nav!.pathSearches > 0 ? nav!.searchMs / nav!.pathSearches : 0,
        averageNodesPerSearch:
          nav!.pathSearches > 0 ? nav!.searchedNodes / nav!.pathSearches : 0,
        cacheMissRatio:
          nav!.requests > 0
            ? (nav!.requests - nav!.cacheHits) / nav!.requests
            : 0,
        failedSearches: nav!.failedSearches,
      };
  }
}

function getThresholds(): Record<string, number> {
  const prefix = {
    collision: "COLLISION",
    "combat-burst": "COMBAT",
    "long-run": "LONG",
    "network-aoi": "NETWORK",
    pathfinding: "PATH",
  }[name];
  const common = {
    serverP95Ms: readPositiveNumber(
      `BENCH_${prefix}_MAX_SERVER_P95_MS`,
      (1000 / scenario.targetTps) * 2,
    ),
    serverAverageMs: readPositiveNumber(
      `BENCH_${prefix}_MAX_SERVER_AVG_MS`,
      1000 / scenario.targetTps,
    ),
  };
  switch (name) {
    case "collision":
      return {
        ...common,
        collisionP95Ms: readPositiveNumber("BENCH_COLLISION_MAX_P95_MS", 24),
        collisionP99Ms: readPositiveNumber("BENCH_COLLISION_MAX_P99_MS", 36),
        worldP95Ms: readPositiveNumber("BENCH_COLLISION_MAX_WORLD_P95_MS", 60),
      };
    case "combat-burst":
      return {
        ...common,
        serverP99Ms: readPositiveNumber("BENCH_COMBAT_MAX_SERVER_P99_MS", 110),
        entityTickP95Ms: readPositiveNumber(
          "BENCH_COMBAT_MAX_ENTITY_P95_MS",
          45,
        ),
        collisionP95Ms: readPositiveNumber(
          "BENCH_COMBAT_MAX_COLLISION_P95_MS",
          24,
        ),
        networkP95Bytes: readPositiveNumber(
          "BENCH_COMBAT_MAX_NETWORK_P95_BYTES",
          120_000,
        ),
      };
    case "long-run":
      return {
        ...common,
        serverP99Ms: readPositiveNumber("BENCH_LONG_MAX_SERVER_P99_MS", 110),
        worldP99Ms: readPositiveNumber("BENCH_LONG_MAX_WORLD_P99_MS", 95),
        heapGrowthMb: readPositiveNumber("BENCH_LONG_MAX_HEAP_GROWTH_MB", 96),
        entityGrowth: readPositiveNumber("BENCH_LONG_MAX_ENTITY_GROWTH", 80),
        networkMaxBytes: readPositiveNumber(
          "BENCH_LONG_MAX_NETWORK_BYTES",
          180_000,
        ),
      };
    case "network-aoi":
      return {
        ...common,
        serverP99Ms: readPositiveNumber("BENCH_NETWORK_MAX_SERVER_P99_MS", 75),
        networkP95Bytes: readPositiveNumber(
          "BENCH_NETWORK_MAX_P95_BYTES",
          90_000,
        ),
        networkMaxBytes: readPositiveNumber("BENCH_NETWORK_MAX_BYTES", 180_000),
        fullSnapshotRatio: readPositiveNumber(
          "BENCH_NETWORK_MAX_FULL_RATIO",
          0.12,
        ),
        snapshotAndWorldP95Ms: readPositiveNumber(
          "BENCH_NETWORK_MAX_WORLD_P95_MS",
          40,
        ),
      };
    case "pathfinding":
      return {
        ...common,
        navDirtyP95Ms: readPositiveNumber("BENCH_PATH_MAX_NAV_DIRTY_P95_MS", 8),
        averageSearchMs: readPositiveNumber(
          "BENCH_PATH_MAX_AVG_SEARCH_MS",
          1.8,
        ),
        averageNodesPerSearch: readPositiveNumber(
          "BENCH_PATH_MAX_AVG_NODES",
          6500,
        ),
        failedSearches: readPositiveNumber(
          "BENCH_PATH_MAX_FAILED_SEARCHES",
          40,
        ),
      };
  }
}

function getScenario(scenarioName: ScenarioName): Scenario {
  const warmupTicks = readPositiveInt(
    "BENCH_WARMUP_TICKS",
    scenarioName === "long-run"
      ? 60
      : scenarioName === "pathfinding"
        ? 50
        : scenarioName === "combat-burst"
          ? 30
          : 40,
  );
  const targetTps = readPositiveNumber("BENCH_TARGET_TPS", 50);
  const table: Record<
    ScenarioName,
    Omit<Scenario, "warmupTicks" | "targetTps">
  > = {
    collision: {
      name: scenarioName,
      clients: 3,
      enemies: readPositiveInt("BENCH_COLLISION_ENEMIES", 180),
      walls: readPositiveInt("BENCH_COLLISION_WALLS", 260),
      interestRadius: 1400,
      sampleTicks: readPositiveInt("BENCH_SAMPLE_TICKS", 180),
    },
    "combat-burst": {
      name: scenarioName,
      clients: 6,
      enemies: readPositiveInt("BENCH_COMBAT_ENEMIES", 260),
      walls: readPositiveInt("BENCH_COMBAT_WALLS", 140),
      interestRadius: 1300,
      sampleTicks: readPositiveInt("BENCH_SAMPLE_TICKS", 180),
    },
    "long-run": {
      name: scenarioName,
      clients: readPositiveInt("BENCH_LONG_CLIENTS", 12),
      enemies: readPositiveInt("BENCH_LONG_ENEMIES", 300),
      walls: readPositiveInt("BENCH_LONG_WALLS", 260),
      interestRadius: 1000,
      sampleTicks: readPositiveInt("BENCH_LONG_TICKS", 900),
    },
    "network-aoi": {
      name: scenarioName,
      clients: readPositiveInt("BENCH_NETWORK_CLIENTS", 32),
      enemies: readPositiveInt("BENCH_NETWORK_ENEMIES", 260),
      walls: readPositiveInt("BENCH_NETWORK_WALLS", 160),
      interestRadius: readPositiveInt("BENCH_NETWORK_INTEREST_RADIUS", 520),
      sampleTicks: readPositiveInt("BENCH_SAMPLE_TICKS", 180),
    },
    pathfinding: {
      name: scenarioName,
      clients: 6,
      enemies: readPositiveInt("BENCH_PATH_ENEMIES", 360),
      walls: readPositiveInt("BENCH_PATH_WALLS", 720),
      interestRadius: 1600,
      sampleTicks: readPositiveInt("BENCH_SAMPLE_TICKS", 220),
    },
  };
  return { ...table[scenarioName], warmupTicks, targetTps };
}

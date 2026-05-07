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
  spawnProjectileBurst,
  spawnWalls,
  summarizeWorldTicks,
  warmup,
  writeBenchmarkReport,
} from "@benchmarks/common.ts";
import {
  assertAllEntityPositionsFinite,
  assertNoDynamicEntityOutsideWorld,
  assertNoDynamicStaticOverlap,
} from "../tests/helpers/collisionInvariants.ts";

bootstrapBenchmarks();

const ENEMIES = readPositiveInt("BENCH_COLLISION_ENEMIES", 520);
const WALLS = readPositiveInt("BENCH_COLLISION_WALLS", 460);
const PROJECTILES = readPositiveInt("BENCH_COLLISION_PROJECTILES", 220);
const WARMUP_TICKS = readPositiveInt("BENCH_WARMUP_TICKS", 40);
const SAMPLE_TICKS = readPositiveInt("BENCH_SAMPLE_TICKS", 180);
const TARGET_TPS = readPositiveNumber("BENCH_TARGET_TPS", 50);

const { runtime, sink } = makeRuntime({ interestRadius: 1400 });
for (const entity of runtime.world.entities.all()) {
  if (
    entity.typeId.startsWith("enemy:") ||
    entity.typeId === "pickup:item_entity"
  ) {
    runtime.world.despawn(entity.id);
  }
}
const clients = connectClients(runtime, 3, "clustered");
const centerX = runtime.world.gameConfig.worldSize.w / 2;
const centerY = runtime.world.gameConfig.worldSize.h / 2;
spawnWalls(runtime, WALLS, { centerX, centerY: centerY - 420, spacing: 18 });
spawnEnemyGrid(runtime, ENEMIES, "police", {
  centerX,
  centerY: centerY + 1800,
  spacing: 18,
});
spawnProjectileBurst(runtime, clients[0]!.playerId, PROJECTILES, "basic");

warmup(runtime, WARMUP_TICKS);
assertAllEntityPositionsFinite(runtime.world);
assertNoDynamicEntityOutsideWorld(runtime.world);
assertNoDynamicStaticOverlap(runtime.world);
sink.reset();

const server = measureTicks(runtime, SAMPLE_TICKS, {
  targetTps: TARGET_TPS,
  beforeTick: (tick) => {
    driveClients(runtime, clients, tick);
    if (tick % 20 === 0) {
      spawnProjectileBurst(runtime, clients[0]!.playerId, 24, "crossbow");
    }
  },
});
const world = summarizeWorldTicks(sink.ticks);
assertAllEntityPositionsFinite(runtime.world);
assertNoDynamicEntityOutsideWorld(runtime.world);
assertNoDynamicStaticOverlap(runtime.world);
const metrics = {
  serverAverageMs: server.average,
  serverP95Ms: server.p95,
  collisionP95Ms: world.collision.p95,
  collisionP99Ms: world.collision.p99,
  worldP95Ms: world.worldStep.p95,
};
const thresholds = {
  serverP95Ms: readPositiveNumber(
    "BENCH_COLLISION_MAX_SERVER_P95_MS",
    (1000 / TARGET_TPS) * 2,
  ),
  serverAverageMs: readPositiveNumber(
    "BENCH_COLLISION_MAX_SERVER_AVG_MS",
    1000 / TARGET_TPS,
  ),
  collisionP95Ms: readPositiveNumber("BENCH_COLLISION_MAX_P95_MS", 24),
  collisionP99Ms: readPositiveNumber("BENCH_COLLISION_MAX_P99_MS", 36),
  worldP95Ms: readPositiveNumber("BENCH_COLLISION_MAX_WORLD_P95_MS", 60),
};

const reportPath = writeBenchmarkReport("collision", {
  scenario: { enemies: ENEMIES, walls: WALLS, projectiles: PROJECTILES },
  server,
  world,
  metrics,
  thresholds,
});
printBenchmarkResult({ name: "collision", metrics, thresholds, reportPath });
failOnThresholds(metrics, thresholds);

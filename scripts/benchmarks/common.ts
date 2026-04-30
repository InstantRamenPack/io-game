import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { InputIntentMessage } from "@shared/net/protocol.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
import { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";
import { SniperBullet } from "@server/entities/projectiles/SniperBullet.ts";
import { Bomber } from "@server/entities/enemies/Bomber.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { DungeonWall } from "@server/entities/structures/DungeonWall.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import type {
  WorldBenchmarkSink,
  WorldBenchmarkTickStats,
} from "@server/world/World.ts";

export type SampleSummary = {
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

export type RateSummary = SampleSummary & {
  hz: number;
  budgetMs: number;
  stableRatio: number;
};

export type BenchmarkResult = {
  name: string;
  metrics: Record<string, number>;
  thresholds: Record<string, number>;
  reportPath: string;
};

export type WorldTickSummary = {
  worldStep: SampleSummary;
  entityTick: SampleSummary;
  enemyTick: SampleSummary;
  collision: SampleSummary;
  navDirty: SampleSummary;
  pickup: SampleSummary;
};

export type SnapshotSummary = {
  clients: number;
  snapshots: number;
  fullSnapshots: number;
  deltaSnapshots: number;
  totalBytes: number;
  averageBytes: number;
  p95Bytes: number;
  maxBytes: number;
  averageEntities: number;
  p95Entities: number;
  maxEntities: number;
  totalRemovedEntityIds: number;
};

export type EnemyName =
  | "bomber"
  | "drifter"
  | "megaknight"
  | "police"
  | "saboteur"
  | "shoota"
  | "wallbreaker";

export type ProjectileName =
  | "basic"
  | "cannon"
  | "crossbow"
  | "drone"
  | "rifle"
  | "sniper";

type EntityCtor = new (id: number) => Entity;
type ProjectileCtor = new (
  id: number,
  config: {
    ownerId: number;
    x: number;
    y: number;
    directionX: number;
    directionY: number;
    rotation?: number;
  },
) => Entity;

export class CapturingNetworkServer implements NetworkServerLike {
  public readonly bytesByClientId = new Map<string, number[]>();
  private readonly clientIds = new Set<string>();
  private readonly entityCounts: number[] = [];
  private readonly removedEntityCounts: number[] = [];
  private snapshots = 0;
  private fullSnapshots = 0;
  private deltaSnapshots = 0;

  public onOpen(): void {}
  public onMessage(): void {}
  public onClose(): void {}
  public broadcast(): void {}
  public disconnect(): void {}

  public send(clientId: string, data: string | Uint8Array): void {
    if (typeof data !== "string") {
      return;
    }
    this.clientIds.add(clientId);

    const bytes = this.bytesByClientId.get(clientId) ?? [];
    bytes.push(data.length);
    this.bytesByClientId.set(clientId, bytes);

    if (!data.startsWith('{"t":"snapshot"')) {
      return;
    }
    this.snapshots += 1;
    if (data.includes('"full":false')) {
      this.deltaSnapshots += 1;
    } else {
      this.fullSnapshots += 1;
    }
    this.entityCounts.push(countJsonKey(data, '"id":'));
    this.removedEntityCounts.push(countRemovedEntityIds(data));
  }

  public reset(): void {
    this.bytesByClientId.clear();
    this.clientIds.clear();
    this.entityCounts.length = 0;
    this.removedEntityCounts.length = 0;
    this.snapshots = 0;
    this.fullSnapshots = 0;
    this.deltaSnapshots = 0;
  }

  public allBytes(): number[] {
    return [...this.bytesByClientId.values()].flat();
  }

  public summarize(): SnapshotSummary {
    const bytes = this.allBytes();
    return {
      clients: this.clientIds.size,
      snapshots: this.snapshots,
      fullSnapshots: this.fullSnapshots,
      deltaSnapshots: this.deltaSnapshots,
      totalBytes: sum(bytes),
      averageBytes: average(bytes),
      p95Bytes: percentile(bytes, 0.95),
      maxBytes: max(bytes),
      averageEntities: average(this.entityCounts),
      p95Entities: percentile(this.entityCounts, 0.95),
      maxEntities: max(this.entityCounts),
      totalRemovedEntityIds: sum(this.removedEntityCounts),
    };
  }
}

export class BenchmarkWorldSink implements WorldBenchmarkSink {
  public readonly ticks: WorldBenchmarkTickStats[] = [];

  public recordWorldTick(stats: WorldBenchmarkTickStats): void {
    this.ticks.push(stats);
  }

  public reset(): void {
    this.ticks.length = 0;
  }
}

export function bootstrapBenchmarks(): void {
  bootstrapTypeRegistries();
}

export function makeRuntime(
  options: {
    interestRadius?: number;
    spawnMultiplier?: number;
    enableWorldBenchmark?: boolean;
  } = {},
): {
  runtime: GameInstanceRuntime;
  network: CapturingNetworkServer;
  sink: BenchmarkWorldSink;
} {
  const config = new GameConfig();
  config.debug.spawnMultiplier = options.spawnMultiplier ?? 0;
  config.replication.interestRadius =
    options.interestRadius ?? config.replication.interestRadius;
  const network = new CapturingNetworkServer();
  const runtime = new GameInstanceRuntime(config, network);
  const sink = new BenchmarkWorldSink();
  if (options.enableWorldBenchmark ?? true) {
    runtime.world.benchmarkSink = sink;
    runtime.world.navPathService.benchmarkEnabled = true;
  }
  return { runtime, network, sink };
}

export function connectClients(
  runtime: GameInstanceRuntime,
  count: number,
  layout: "clustered" | "spread" = "spread",
): Array<{ clientId: string; playerId: number }> {
  const clients: Array<{ clientId: string; playerId: number }> = [];
  const centerX = runtime.world.gameConfig.worldSize.w / 2;
  const centerY = runtime.world.gameConfig.worldSize.h / 2;
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = layout === "clustered" ? 36 : 420;
  for (let index = 0; index < count; index += 1) {
    const clientId = `bench-client-${index}`;
    const playerId = runtime.connectReadyClient(clientId, `bench-${index}`);
    const player = runtime.world.get(playerId);
    if (player) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      player.x = centerX + (column - (columns - 1) / 2) * spacing;
      player.y = centerY + (row - (columns - 1) / 2) * spacing;
    }
    clients.push({ clientId, playerId });
  }
  return clients;
}

export function driveClients(
  runtime: GameInstanceRuntime,
  clients: readonly { clientId: string }[],
  tick: number,
): void {
  for (let index = 0; index < clients.length; index += 1) {
    const phase = (tick + index) % 80;
    runtime.handleInputIntent(clients[index]!.clientId, {
      t: "input",
      seq: tick,
      clientTimeMs: tick * 50,
      theta: (index % 8) * 0.7853981633974483,
      movement: {
        up: phase >= 20 && phase < 40,
        down: phase >= 60,
        left: phase >= 40 && phase < 60,
        right: phase < 20,
      },
    } satisfies InputIntentMessage);
  }
}

export function warmup(runtime: GameInstanceRuntime, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) {
    runtime.tick();
  }
}

export function measureTicks(
  runtime: GameInstanceRuntime,
  ticks: number,
  options: {
    beforeTick?: (tick: number) => void;
    afterTick?: (tick: number) => void;
    targetTps?: number;
  } = {},
): RateSummary {
  const samples: number[] = [];
  const startedAt = performance.now();
  for (let index = 0; index < ticks; index += 1) {
    options.beforeTick?.(index);
    const tickStartedAt = performance.now();
    runtime.tick();
    samples.push(performance.now() - tickStartedAt);
    options.afterTick?.(index);
  }
  return summarizeRateSamples(
    samples,
    performance.now() - startedAt,
    options.targetTps ?? 100,
  );
}

export function spawnEnemyGrid(
  runtime: GameInstanceRuntime,
  count: number,
  enemyName: EnemyName = "police",
  options: { centerX?: number; centerY?: number; spacing?: number } = {},
): void {
  spawnGrid(runtime, enemyCtor(enemyName), count, options);
}

export function spawnMixedEnemyGrid(
  runtime: GameInstanceRuntime,
  count: number,
  options: { centerX?: number; centerY?: number; spacing?: number } = {},
): void {
  const names: EnemyName[] = [
    "police",
    "shoota",
    "drifter",
    "saboteur",
    "bomber",
    "wallbreaker",
    "megaknight",
  ];
  const centerX = options.centerX ?? runtime.world.gameConfig.worldSize.w / 2;
  const centerY = options.centerY ?? runtime.world.gameConfig.worldSize.h / 2;
  const spacing = options.spacing ?? 28;
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index += 1) {
    const entity = new (enemyCtor(names[index % names.length]!))(
      runtime.world.allocEntityId(),
    );
    const row = Math.floor(index / columns);
    const column = index % columns;
    entity.x = centerX + (column - (columns - 1) / 2) * spacing;
    entity.y = centerY + (row - (columns - 1) / 2) * spacing;
    runtime.world.spawn(entity);
  }
}

export function spawnWalls(
  runtime: GameInstanceRuntime,
  count: number,
  options: {
    centerX?: number;
    centerY?: number;
    spacing?: number;
    dungeon?: boolean;
  } = {},
): void {
  const centerX = options.centerX ?? runtime.world.gameConfig.worldSize.w / 2;
  const centerY = options.centerY ?? runtime.world.gameConfig.worldSize.h / 2;
  const spacing = options.spacing ?? 18;
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index += 1) {
    const entity = options.dungeon
      ? new DungeonWall(runtime.world.allocEntityId())
      : new Wall(runtime.world.allocEntityId(), 1);
    const row = Math.floor(index / columns);
    const column = index % columns;
    entity.x = centerX + (column - (columns - 1) / 2) * spacing;
    entity.y = centerY + (row - (columns - 1) / 2) * spacing;
    runtime.world.spawn(entity);
  }
}

export function spawnProjectileBurst(
  runtime: GameInstanceRuntime,
  ownerId: number,
  count: number,
  projectileName: ProjectileName,
  options: { centerX?: number; centerY?: number; radius?: number } = {},
): void {
  const ProjectileCtor = projectileCtor(projectileName);
  const centerX = options.centerX ?? runtime.world.gameConfig.worldSize.w / 2;
  const centerY = options.centerY ?? runtime.world.gameConfig.worldSize.h / 2;
  const radius = options.radius ?? 64;
  for (let index = 0; index < count; index += 1) {
    const theta = (Math.PI * 2 * index) / count;
    const entity = new ProjectileCtor(runtime.world.allocEntityId(), {
      ownerId,
      x: centerX + Math.cos(theta) * radius,
      y: centerY + Math.sin(theta) * radius,
      directionX: Math.cos(theta),
      directionY: Math.sin(theta),
      rotation: theta,
    });
    runtime.world.spawn(entity);
  }
}

export function summarizeWorldTicks(
  ticks: readonly WorldBenchmarkTickStats[],
): WorldTickSummary {
  return {
    worldStep: summarizeSamples(ticks.map((tick) => tick.totalMs)),
    entityTick: summarizeSamples(ticks.map((tick) => tick.entityTickMs)),
    enemyTick: summarizeSamples(ticks.map((tick) => tick.enemyTickMs)),
    collision: summarizeSamples(ticks.map((tick) => tick.collisionMs)),
    navDirty: summarizeSamples(ticks.map((tick) => tick.navDirtyMs)),
    pickup: summarizeSamples(ticks.map((tick) => tick.pickupMs)),
  };
}

export function summarizeSnapshots(
  network: CapturingNetworkServer,
): SnapshotSummary {
  return network.summarize();
}

export function summarizeRateSamples(
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

export function summarizeSamples(samples: readonly number[]): SampleSummary {
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

export function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function failOnThresholds(
  metrics: Record<string, number>,
  thresholds: Record<string, number>,
): void {
  const failures = Object.entries(thresholds).filter(([metric, threshold]) => {
    const value = metrics[metric];
    return value === undefined || value > threshold;
  });
  if (failures.length === 0) {
    return;
  }
  throw new Error(
    failures
      .map(([metric, threshold]) => {
        const value = metrics[metric];
        return `${metric}=${format(value ?? Number.NaN)} threshold=${format(threshold)}`;
      })
      .join("; "),
  );
}

export function writeBenchmarkReport(name: string, report: unknown): string {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const path = resolve("benchmark-results", `${name}-${timestamp}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export function printBenchmarkResult(result: BenchmarkResult): void {
  console.log(`benchmark ${result.name}`);
  for (const [metric, value] of Object.entries(result.metrics)) {
    const threshold = result.thresholds[metric];
    const thresholdText =
      threshold === undefined ? "" : ` threshold=${format(threshold)}`;
    console.log(`  ${metric}=${format(value)}${thresholdText}`);
  }
  console.log(`  report=${result.reportPath}`);
}

export function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function spawnGrid(
  runtime: GameInstanceRuntime,
  EntityCtor: EntityCtor,
  count: number,
  options: { centerX?: number; centerY?: number; spacing?: number },
): void {
  const centerX = options.centerX ?? runtime.world.gameConfig.worldSize.w / 2;
  const centerY = options.centerY ?? runtime.world.gameConfig.worldSize.h / 2;
  const spacing = options.spacing ?? 28;
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

function enemyCtor(name: EnemyName): EntityCtor {
  const ctors: Record<EnemyName, EntityCtor> = {
    bomber: Bomber,
    drifter: Drifter,
    megaknight: Megaknight,
    police: Police,
    saboteur: Saboteur,
    shoota: Shoota,
    wallbreaker: Wallbreaker,
  };
  return ctors[name];
}

function projectileCtor(name: ProjectileName): ProjectileCtor {
  const ctors: Record<ProjectileName, ProjectileCtor> = {
    basic: BasicBullet,
    cannon: CannonBullet,
    crossbow: CrossbowArrow,
    drone: HomingDrone,
    rifle: RifleBullet,
    sniper: SniperBullet,
  };
  return ctors[name];
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

function countJsonKey(source: string, key: string): number {
  let count = 0;
  let index = source.indexOf(key);
  while (index >= 0) {
    count += 1;
    index = source.indexOf(key, index + key.length);
  }
  return count;
}

function countRemovedEntityIds(source: string): number {
  const key = '"removedEntityIds":[';
  const start = source.indexOf(key);
  if (start < 0) {
    return 0;
  }
  const valueStart = start + key.length;
  const valueEnd = source.indexOf("]", valueStart);
  if (valueEnd <= valueStart) {
    return 0;
  }
  let count = 1;
  for (let index = valueStart; index < valueEnd; index += 1) {
    if (source.charCodeAt(index) === 44) {
      count += 1;
    }
  }
  return count;
}

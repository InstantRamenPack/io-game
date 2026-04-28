import { GameConfig } from "@shared/config/GameConfig.ts";
import type { ServerToClientMessage } from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";

const POLICE_COUNT = readPositiveInt("OPT_POLICE_COUNT", 500);
const WARMUP_TICKS = readPositiveInt("OPT_WARMUP_TICKS", 40);
const SAMPLE_TICKS = readPositiveInt("OPT_SAMPLE_TICKS", 240);
const TARGET_TPS = readPositiveNumber("OPT_TARGET_TPS", 20);
const TARGET_FPS = readPositiveNumber("OPT_TARGET_FPS", 60);
const MIN_STABLE_RATIO = readPositiveNumber("OPT_MIN_STABLE_RATIO", 0.95);
const FRAME_HISTORY_LIMIT = 8;

class CapturingNetworkServer implements NetworkServerLike {
  public readonly snapshots: WorldSnapshot[] = [];

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
    }
  }

  public broadcast(): void {}
  public disconnect(): void {}
}

type Measurement = {
  totalMs: number;
  averageMs: number;
  hz: number;
  worstMs: number;
  stableRatio: number;
};

function makeConfig(): GameConfig {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  config.replication.interestRadius = Math.max(
    config.worldSize.w,
    config.worldSize.h,
  );
  config.interpolation.historySize = FRAME_HISTORY_LIMIT;
  return config;
}

function spawnPolice(runtime: GameInstanceRuntime, count: number): void {
  const centerX = runtime.world.gameConfig.worldSize.w / 2;
  const centerY = runtime.world.gameConfig.worldSize.h / 2;
  const spacing = 34;
  const columns = Math.ceil(Math.sqrt(count));

  for (let index = 0; index < count; index += 1) {
    const police = new Police(runtime.world.allocEntityId());
    const row = Math.floor(index / columns);
    const column = index % columns;
    police.x = centerX + (column - columns / 2) * spacing;
    police.y = centerY + (row - columns / 2) * spacing;
    runtime.world.spawn(police);
  }
}

function measureServerTicks(
  runtime: GameInstanceRuntime,
  networkServer: CapturingNetworkServer,
): Measurement {
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    runtime.tick();
  }
  networkServer.snapshots.length = 0;

  const samples: number[] = [];
  const startedAt = performance.now();
  for (let index = 0; index < SAMPLE_TICKS; index += 1) {
    const tickStartedAt = performance.now();
    runtime.tick();
    samples.push(performance.now() - tickStartedAt);
  }
  return summarizeSamples(samples, performance.now() - startedAt, TARGET_TPS);
}

function measureClientFrames(snapshots: readonly WorldSnapshot[]): Measurement {
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

  return summarizeSamples(samples, performance.now() - startedAt, TARGET_FPS);
}

function summarizeSamples(
  samples: readonly number[],
  totalMs: number,
  targetHz: number,
): Measurement {
  const budgetMs = 1000 / targetHz;
  const averageMs =
    samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const worstMs = Math.max(...samples);
  const stableSamples = samples.filter((sample) => sample <= budgetMs).length;
  return {
    totalMs,
    averageMs,
    hz: samples.length / (totalMs / 1000),
    worstMs,
    stableRatio: stableSamples / samples.length,
  };
}

function assertStable(label: string, measurement: Measurement): void {
  if (measurement.hz < labelTarget(label) * MIN_STABLE_RATIO) {
    throw new Error(
      `${label} below target: measured=${format(measurement.hz)} target=${labelTarget(
        label,
      )}`,
    );
  }
  if (measurement.stableRatio < MIN_STABLE_RATIO) {
    throw new Error(
      `${label} unstable: stable=${formatPercent(
        measurement.stableRatio,
      )} required=${formatPercent(MIN_STABLE_RATIO)}`,
    );
  }
}

function labelTarget(label: string): number {
  return label === "TPS" ? TARGET_TPS : TARGET_FPS;
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

function format(value: number): string {
  return value.toFixed(2);
}

function formatMs(value: number): string {
  return `${format(value)}ms`;
}

function formatPercent(value: number): string {
  return `${format(value * 100)}%`;
}

function printMeasurement(label: string, measurement: Measurement): void {
  console.log(
    `${label}: ${format(measurement.hz)} target=${labelTarget(
      label,
    )} avg=${formatMs(measurement.averageMs)} worst=${formatMs(
      measurement.worstMs,
    )} stable=${formatPercent(measurement.stableRatio)}`,
  );
}

bootstrapTypeRegistries();

const networkServer = new CapturingNetworkServer();
const runtime = new GameInstanceRuntime(makeConfig(), networkServer);
runtime.connectReadyClient("optimization-client", "optimization-test");
spawnPolice(runtime, POLICE_COUNT);

console.log(
  `optimization validation: police=${POLICE_COUNT} warmupTicks=${WARMUP_TICKS} sampleTicks=${SAMPLE_TICKS}`,
);

const serverMeasurement = measureServerTicks(runtime, networkServer);
const clientMeasurement = measureClientFrames(networkServer.snapshots);

printMeasurement("TPS", serverMeasurement);
printMeasurement("FPS", clientMeasurement);

assertStable("TPS", serverMeasurement);
assertStable("FPS", clientMeasurement);

console.log("optimization validation passed");

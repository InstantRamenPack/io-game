import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import {
  Interpolator,
  type InterpolationDebugFrame,
} from "@client/net/Interpolator.ts";
import { DebugNetworkSimulator } from "@client/net/DebugNetworkSimulator.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import type { SnapshotReceiveStats } from "@client/net/ClientWorldState.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import {
  makePlayerSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";
import {
  computeSmoothnessMetrics,
  summarizeInterpolationModes,
  type MotionSample,
  type SmoothnessMetrics,
} from "@tests/helpers/smoothnessMetrics.ts";

export function simulateNetworkedSnapshotStream(options: {
  profileName: "perfect" | "mild" | "bad";
  seed: number;
  durationMs: number;
  serverTickMs: number;
  frameMs: number;
  entityId: number;
  interpolationConfig?: Partial<GameConfig["interpolation"]>;
  positionAtTick: (tick: number) => {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation?: number;
  };
}): {
  samples: MotionSample[];
  debugFrames: InterpolationDebugFrame[];
  snapshotStats: SnapshotReceiveStats;
  modeSummary: {
    interpolateRatio: number;
    holdRatio: number;
    extrapolateRatio: number;
    snapCount: number;
  };
  metrics: SmoothnessMetrics;
} {
  const simulator = new DebugNetworkSimulator();
  simulator.configure({
    profileName: options.profileName,
    seed: options.seed,
    enabled: true,
  });

  const deliveries = buildSnapshotDeliveries(options, simulator);
  const worldState = new ClientWorldState(
    options.interpolationConfig?.historySize ?? 8,
  );
  const interpolator = new Interpolator({
    snapDistance: options.interpolationConfig?.snapDistance ?? 192,
    expectedSnapshotMs: options.serverTickMs,
    tickDurationSmoothing: options.interpolationConfig?.tickDurationSmoothing,
    renderDelaySmoothing: options.interpolationConfig?.renderDelaySmoothing,
    minRenderDelayTicks: options.interpolationConfig?.minRenderDelayTicks,
    maxRenderDelayTicks: options.interpolationConfig?.maxRenderDelayTicks,
    maxExtrapolationTicks: options.interpolationConfig?.maxExtrapolationTicks,
    tickDurationMinFactor: options.interpolationConfig?.tickDurationMinFactor,
    tickDurationMaxFactor: options.interpolationConfig?.tickDurationMaxFactor,
    arrivalEwmaSmoothing: options.interpolationConfig?.arrivalEwmaSmoothing,
    jitterEwmaSmoothing: options.interpolationConfig?.jitterEwmaSmoothing,
    jitterBufferMultiplier: options.interpolationConfig?.jitterBufferMultiplier,
    jitterBufferSafetyMs: options.interpolationConfig?.jitterBufferSafetyMs,
    maxDebugLogEntries: options.interpolationConfig?.maxDebugLogEntries,
  });

  const samples: MotionSample[] = [];
  const debugFrames: InterpolationDebugFrame[] = [];
  const warmupMs = 500;
  let deliveryIndex = 0;

  for (
    let frameTimeMs = 0;
    frameTimeMs <= options.durationMs;
    frameTimeMs += options.frameMs
  ) {
    while (
      deliveryIndex < deliveries.length &&
      (deliveries[deliveryIndex]?.timeMs ?? Number.POSITIVE_INFINITY) <=
        frameTimeMs
    ) {
      const delivery = deliveries[deliveryIndex]!;
      worldState.pushSnapshot(delivery.snapshot, delivery.timeMs);
      deliveryIndex += 1;
    }

    interpolator.updateInterpolation(
      worldState,
      frameTimeMs,
      options.frameMs,
      options.entityId,
    );
    const debugFrame = interpolator.getLatestDebugFrame();
    if (debugFrame) {
      debugFrames.push(debugFrame);
      if (debugFrame.localPlayer && frameTimeMs >= warmupMs) {
        samples.push({
          timeMs: frameTimeMs,
          x: debugFrame.localPlayer.renderedX,
          y: debugFrame.localPlayer.renderedY,
        });
      }
    }
  }

  const metrics = computeSmoothnessMetrics(
    samples,
    { x: 1, y: 0 },
    {
      debugFrames,
    },
  );
  const modeSummary = summarizeInterpolationModes(debugFrames, warmupMs);

  return {
    samples,
    debugFrames,
    snapshotStats: worldState.getSnapshotReceiveStats(),
    modeSummary,
    metrics,
  };
}

type SnapshotDelivery = {
  timeMs: number;
  snapshot: WorldSnapshot;
};

function buildSnapshotDeliveries(
  options: {
    profileName: "perfect" | "mild" | "bad";
    seed: number;
    durationMs: number;
    serverTickMs: number;
    entityId: number;
    positionAtTick: (tick: number) => {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation?: number;
    };
  },
  simulator: DebugNetworkSimulator,
): SnapshotDelivery[] {
  const deliveries: SnapshotDelivery[] = [];
  for (
    let tick = 1, serverTimeMs = 0;
    serverTimeMs <= options.durationMs;
    tick += 1, serverTimeMs += options.serverTickMs
  ) {
    const position = options.positionAtTick(tick);
    const snapshot = makeSnapshot(tick, [
      makePlayerSnapshot(options.entityId, position.x, position.y, {
        vx: position.vx,
        vy: position.vy,
        rotation: position.rotation ?? 0,
      }),
    ]);
    const payload = JSON.stringify({ t: "snapshot", snapshot });
    const planned = simulator.planDeliveries(payload);
    for (const delivery of planned) {
      deliveries.push({
        timeMs: serverTimeMs + delivery.delayMs,
        snapshot,
      });
    }
  }
  return deliveries.sort((a, b) => a.timeMs - b.timeMs);
}

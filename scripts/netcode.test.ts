import { readFileSync } from "node:fs";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { LocalPlayerPrediction } from "@client/client/prediction/LocalPlayerPrediction.ts";
import {
  parseClientToServerMessage,
  type InputIntentMessage,
} from "@shared/net/protocol.ts";
import type {
  EntitySnapshot,
  InventorySnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import { parseFastInputMessage } from "@server/net/FastInputMessageParser.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import type { Player } from "@server/entities/Player.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import { DebugNetworkSimulator } from "@client/net/DebugNetworkSimulator.ts";

type TestCase = {
  name: string;
  run: () => void;
};

type FakePixiApp = Parameters<PixiViewportController["update"]>[1];
type FakePixiContainer = Parameters<PixiViewportController["update"]>[2];

class FakeNetworkServer implements NetworkServerLike {
  public readonly sent: Array<{ clientId: string; data: string | Uint8Array }> =
    [];

  public onOpen(): void {}
  public onMessage(): void {}
  public onClose(): void {}
  public send(clientId: string, data: string | Uint8Array): void {
    this.sent.push({ clientId, data });
  }
  public broadcast(data: string | Uint8Array): void {
    this.sent.push({ clientId: "*", data });
  }
  public disconnect(): void {}
}

const emptyMovement = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
});

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: actual=${actual} expected=${expected}`);
  }
}

function makeConfig(): GameConfig {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  config.interpolation.historySize = 8;
  return config;
}

function makeRuntime(): {
  runtime: GameInstanceRuntime;
  player: Player;
  playerId: number;
} {
  const runtime = new GameInstanceRuntime(
    makeConfig(),
    new FakeNetworkServer(),
  );
  const playerId = runtime.connectReadyClient("client-1", "netcode-test");
  const player = runtime.world.get<Player>(playerId);
  assert(player, "expected connected player");
  return { runtime, player, playerId };
}

function makeInput(
  seq: number,
  movement: InputIntentMessage["movement"],
  theta = 0,
): InputIntentMessage {
  return {
    t: "input",
    seq,
    clientTimeMs: seq * 10,
    theta,
    movement,
  };
}

function tick(runtime: GameInstanceRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) {
    runtime.tick();
  }
}

function movingRight(): InputIntentMessage["movement"] {
  return { ...emptyMovement, right: true };
}

function movingLeft(): InputIntentMessage["movement"] {
  return { ...emptyMovement, left: true };
}

function movingDownRight(): InputIntentMessage["movement"] {
  return { ...emptyMovement, right: true, down: true };
}

test("server-authoritative movement is driven by input intent", () => {
  const { runtime, player } = makeRuntime();
  const startX = player.x;
  runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
  tick(runtime, 3);
  assert(player.x > startX, "player should move right on server ticks");
  assert(player.vx > 0, "server velocity should be positive");
});

test("client input protocol rejects authoritative x/y", () => {
  const raw = JSON.stringify({
    t: "input",
    seq: 1,
    clientTimeMs: 1,
    x: 100,
    y: 200,
    theta: 0,
    movement: emptyMovement,
  });
  assert(parseClientToServerMessage(raw) === null, "schema must reject x/y");
  assert(
    parseFastInputMessage(raw).kind === "invalid",
    "fast parser must reject x/y",
  );
  const wsClientSource = readFileSync(
    "apps/client/src/net/WsClient.ts",
    "utf8",
  );
  assert(!wsClientSource.includes("sendPose"), "sendPose must not exist");
  assert(!wsClientSource.includes('"t":"pose"'), "pose packets must not exist");
});

test("stale and duplicate input are ignored without corrupting movement", () => {
  const { runtime, player } = makeRuntime();
  runtime.handleInputIntent("client-1", makeInput(2, movingRight()));
  tick(runtime, 2);
  const beforeStaleX = player.x;
  runtime.handleInputIntent("client-1", makeInput(1, movingLeft()));
  runtime.handleInputIntent("client-1", makeInput(2, movingLeft()));
  tick(runtime, 2);
  assert(player.x >= beforeStaleX, "stale duplicate must not reverse movement");
});

test("out-of-order input does not corrupt movement", () => {
  const { runtime, player } = makeRuntime();
  runtime.handleInputIntent("client-1", makeInput(5, movingRight()));
  runtime.handleInputIntent("client-1", makeInput(4, movingLeft()));
  tick(runtime, 3);
  assert(player.vx > 0, "older left input must not override newer right input");
});

test("movement stops cleanly when input stops", () => {
  const { runtime, player } = makeRuntime();
  runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
  tick(runtime, 3);
  assert(player.vx > 0, "player should be moving before stop input");
  runtime.handleInputIntent("client-1", makeInput(2, { ...emptyMovement }));
  tick(runtime, 6);
  assertNear(player.vx, 0, 0.001, "drive velocity should settle to zero");
  assertNear(player.vy, 0, 0.001, "vertical velocity should remain zero");
});

test("movement stops cleanly when fresh input is missing", () => {
  const { runtime, player } = makeRuntime();
  runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
  tick(runtime, 3);
  assert(player.vx > 0, "player should be moving before timeout");
  tick(runtime, 6);
  assertNear(player.vx, 0, 0.001, "stale input timeout should stop drive");
});

test("local prediction drops acknowledged inputs", () => {
  const config = makeConfig();
  const prediction = new LocalPlayerPrediction(config);
  const player = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 8);
  for (let seq = 1; seq <= 4; seq += 1) {
    prediction.recordAndPredict(player, {
      seq,
      clientTimeMs: seq * 10,
      frameDeltaMs: 50,
      theta: 0,
      movement: movingRight(),
    });
  }
  prediction.reconcile(player, player.getAuthoritativePose(), 2);
  assert(
    prediction.getPendingInputCount() === 2,
    "acknowledged inputs should be removed",
  );
  prediction.reconcile(player, player.getAuthoritativePose(), 3);
  assert(
    prediction.getPendingInputCount() === 1,
    "oldest pending input should be acknowledged",
  );
});

test("local prediction replays pending inputs after reconciliation", () => {
  const config = makeConfig();
  const prediction = new LocalPlayerPrediction(config);
  const player = new ClientEntity(makePlayerSnapshot(1, 100, 0), 1, 8);
  prediction.recordAndPredict(player, {
    seq: 1,
    clientTimeMs: 10,
    frameDeltaMs: 50,
    theta: 0,
    movement: movingRight(),
  });
  prediction.recordAndPredict(player, {
    seq: 2,
    clientTimeMs: 20,
    frameDeltaMs: 50,
    theta: 0,
    movement: movingRight(),
  });

  prediction.reconcile(
    player,
    { x: 100, y: 0, vx: 0, vy: 0, rotation: 0 },
    1,
  );

  assert(
    prediction.getPendingInputCount() === 1,
    "reconcile should keep only unacknowledged inputs",
  );
  assertNear(
    player.x,
    115,
    0.001,
    "reconcile should replay remaining inputs",
  );
});

test("diagonal movement is normalized", () => {
  const { runtime, player } = makeRuntime();
  runtime.handleInputIntent("client-1", makeInput(1, movingDownRight()));
  tick(runtime, 3);
  assert(
    Math.hypot(player.vx, player.vy) <= player.moveSpeed + 0.001,
    "diagonal speed must not exceed move speed",
  );
  assert(
    player.vx > 0 && player.vy > 0,
    "diagonal input should move both axes",
  );
});

test("server collision blocks movement through static blockers", () => {
  const { runtime, player } = makeRuntime();
  const wall = new Wall(runtime.world.allocEntityId(), 1, player.id);
  wall.x = player.x + 64;
  wall.y = player.y;
  runtime.world.spawn(wall);
  runtime.world.markSpatialDirty();
  for (let seq = 1; seq <= 8; seq += 1) {
    runtime.handleInputIntent("client-1", makeInput(seq, movingRight()));
    tick(runtime, 3);
  }
  const playerHalfWidth = 16;
  const wallHalfWidth = 20;
  assert(
    player.x + playerHalfWidth <= wall.x - wallHalfWidth + 0.01,
    "player should stop at wall contact",
  );
});

test("snapshot receiver ignores duplicate and out-of-order snapshots", () => {
  const state = new ClientWorldState(8);
  state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 10, 10)]), 50);
  state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 20, 10)]), 100);
  state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 20, 10)]), 110);
  state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 10, 10)]), 120);
  const stats = state.getSnapshotReceiveStats();
  assert(stats.duplicateSnapshotCount === 1, "duplicate count should be 1");
  assert(stats.outOfOrderSnapshotCount === 1, "out-of-order count should be 1");
  assert(state.latestTick === 2, "latest tick must not roll back");
});

test("steady 20Hz snapshots render smoothly at 60 FPS", () => {
  const result = simulateInterpolation({
    durationMs: 3000,
    snapshotTimes: makeSnapshotTimes(0, 3000, 50),
    positionAtTick: (tickNumber) => ({ x: 100 + tickNumber * 15, y: 100 }),
  });
  assert(result.snapCount === 0, "steady movement should not snap");
  assert(
    result.extrapolatedFramesAfterWarmup === 0,
    "perfect steady state should not extrapolate",
  );
  assert(
    result.localRmsResidual <= 1.0,
    `linear steady movement residual should be <= 1 world unit, got ${result.localRmsResidual}`,
  );
});

test("start-stop movement with jitter remains bounded", () => {
  const result = simulateInterpolation({
    durationMs: 3000,
    snapshotTimes: makeSnapshotTimes(0, 3000, 50, (index) =>
      index % 2 === 0 ? 12 : -8,
    ),
    positionAtTick: (tickNumber) => ({
      x: 100 + Math.min(tickNumber, 30) * 12,
      y: 100,
    }),
  });
  assert(result.snapCount === 0, "jittered start-stop should not snap");
  assert(result.maxExtrapolationTicks <= 0.35, "extrapolation must be capped");
});

test("direction changes do not create correction buzz", () => {
  const result = simulateInterpolation({
    durationMs: 3600,
    snapshotTimes: makeSnapshotTimes(0, 3600, 50, (index) =>
      index % 3 === 0 ? 15 : -10,
    ),
    positionAtTick: (tickNumber) => {
      const phase = Math.floor(tickNumber / 10) % 2;
      return {
        x: 500 + (phase === 0 ? tickNumber * 8 : 800 - tickNumber * 8),
        y: 500,
      };
    },
  });
  assert(
    result.maxConsecutiveCorrectionFlips <= 5,
    "correction direction should not flip for more than 5 consecutive frames",
  );
});

test("packet loss bursts and delayed snapshots use bounded extrapolation", () => {
  const snapshotTimes = makeSnapshotTimes(0, 3500, 50).filter(
    (_time, index) => index < 20 || index > 24,
  );
  const result = simulateInterpolation({
    durationMs: 3500,
    snapshotTimes,
    positionAtTick: (tickNumber) => ({ x: 100 + tickNumber * 10, y: 200 }),
  });
  assert(
    result.extrapolatedFramesAfterWarmup > 0,
    "loss burst should extrapolate",
  );
  assert(
    result.maxExtrapolationTicks <= 0.35,
    "extrapolation must stay capped",
  );
});

test("variable latency and delayed snapshots stay bounded", () => {
  const result = simulateInterpolation({
    durationMs: 4200,
    snapshotTimes: makeSnapshotTimes(0, 4200, 50, (index) => {
      if (index % 17 === 0) {
        return 95;
      }
      if (index % 5 === 0) {
        return -18;
      }
      return index % 2 === 0 ? 35 : -6;
    }),
    positionAtTick: (tickNumber) => ({
      x: 200 + tickNumber * 9,
      y: 350,
    }),
  });
  assert(result.snapCount === 0, "variable latency should not hard snap");
  assert(
    result.maxExtrapolationTicks <= 0.35,
    "variable latency extrapolation must stay capped",
  );
  assert(
    result.maxConsecutiveCorrectionFlips <= 5,
    "variable latency must not create correction buzz",
  );
});

test("entity spawn and despawn are handled during interpolation", () => {
  const state = new ClientWorldState(8);
  state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
  state.pushSnapshot(
    makeSnapshot(2, [
      makePlayerSnapshot(1, 0, 0),
      makePlayerSnapshot(2, 50, 0),
    ]),
    100,
  );
  assert(state.clientWorld?.entities.has(2), "spawned entity should exist");
  state.pushSnapshot(
    {
      ...makeSnapshot(3, [], false),
      removedEntityIds: [2],
    },
    150,
  );
  assert(
    !state.clientWorld?.entities.has(2),
    "despawned entity should be removed",
  );
});

test("incomplete delta-only new entities wait for a complete keyframe", () => {
  const state = new ClientWorldState(8);
  const incompleteDelta = {
    id: 2,
    kind: "player",
    x: 50,
    y: 0,
    vx: 0,
    vy: 0,
    rotation: 0,
  } as EntitySnapshot;

  state.pushSnapshot(makeSnapshot(1, [incompleteDelta], false), 50);
  assert(
    !state.clientWorld?.entities.has(2),
    "incomplete delta-only entity should be ignored until metadata arrives",
  );

  state.pushSnapshot(
    makeSnapshot(2, [makePlayerSnapshot(2, 60, 0)], false),
    100,
  );
  const entity = state.clientWorld?.entities.get(2);
  assert(
    entity,
    "complete keyframe should create the previously missing entity",
  );
  assertNear(entity.serverX, 60, 0.001, "keyframe should apply server x");
});

test("death and respawn discontinuities reset interpolation history", () => {
  const state = new ClientWorldState(8);
  state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 100, 100)]), 50);
  state.pushSnapshot(
    makeSnapshot(2, [
      makePlayerSnapshot(1, 100, 100, {
        alive: false,
        hp: 0,
      }),
    ]),
    100,
  );
  let entity = state.clientWorld?.entities.get(1);
  assert(entity, "dead player entity should still be represented in net state");
  assert(
    entity.lastDiscontinuityTick === 2,
    "death should be marked as an interpolation discontinuity",
  );
  assert(
    entity.getServerFrameHistoryLength() === 1,
    "death should reset server-frame history",
  );

  state.pushSnapshot(makeSnapshot(3, [makePlayerSnapshot(1, 800, 600)]), 150);
  entity = state.clientWorld?.entities.get(1);
  assert(entity, "respawned player should exist");
  assert(
    entity.lastDiscontinuityTick === 3,
    "respawn should be marked as an interpolation discontinuity",
  );
  assertNear(entity.x, 800, 0.001, "respawn should snap visual x to spawn");
  assertNear(entity.y, 600, 0.001, "respawn should snap visual y to spawn");
});

test("snapshot history remains bounded", () => {
  const state = new ClientWorldState(8);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 50,
  });
  for (let tickNumber = 1; tickNumber <= 100; tickNumber += 1) {
    state.pushSnapshot(
      makeSnapshot(tickNumber, [makePlayerSnapshot(1, tickNumber, 0)]),
      tickNumber * 50,
    );
    interpolator.updateInterpolation(state, tickNumber * 50, 16, 1);
  }
  const entity = state.clientWorld?.entities.get(1);
  assert(entity, "entity should exist");
  assert(
    entity.getServerFrameHistoryLength() <= 8,
    "entity history should be bounded",
  );
});

test("local and remote players render from authoritative snapshots", () => {
  const state = new ClientWorldState(8);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 50,
  });
  state.pushSnapshot(
    makeSnapshot(1, [
      makePlayerSnapshot(1, 0, 0),
      makePlayerSnapshot(2, 100, 0),
    ]),
    50,
  );
  state.pushSnapshot(
    makeSnapshot(2, [
      makePlayerSnapshot(1, 10, 0),
      makePlayerSnapshot(2, 110, 0),
    ]),
    100,
  );
  interpolator.updateInterpolation(state, 100, 16, 1);
  const local = state.clientWorld?.entities.get(1);
  const remote = state.clientWorld?.entities.get(2);
  assert(local && remote, "local and remote entities should exist");
  assert(local.x >= 0 && local.x <= 10, "local render should sample snapshots");
  assert(
    remote.x >= 100 && remote.x <= 110,
    "remote render should sample snapshots",
  );
});

test("interpolator can skip local predicted player", () => {
  const state = new ClientWorldState(8);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 50,
  });
  state.pushSnapshot(
    makeSnapshot(1, [
      makePlayerSnapshot(1, 0, 0),
      makePlayerSnapshot(2, 100, 0),
    ]),
    50,
  );
  state.pushSnapshot(
    makeSnapshot(2, [
      makePlayerSnapshot(1, 10, 0),
      makePlayerSnapshot(2, 110, 0),
    ]),
    100,
  );
  const local = state.clientWorld?.entities.get(1);
  const remote = state.clientWorld?.entities.get(2);
  assert(local && remote, "local and remote entities should exist");
  local.x = 999;
  local.y = 999;
  const remoteBeforeX = remote.x;
  interpolator.updateInterpolation(state, 200, 16, 1, {
    skipEntityIds: new Set([1]),
  });
  assert(local.x === 999 && local.y === 999, "local player should be skipped");
  assert(
    remote.x > remoteBeforeX,
    "remote player should still be interpolated",
  );
});

test("camera is stable during idle and smooth during constant movement", () => {
  const idleRms = simulateCameraIdleRms();
  assert(
    idleRms <= 0.5,
    `idle camera RMS should be <= 0.5 CSS px, got ${idleRms}`,
  );
  const movementRms = simulateCameraMovementResidualRms();
  assert(
    movementRms <= 1.0,
    `constant movement camera residual RMS should be <= 1.0 CSS px, got ${movementRms}`,
  );
});

test("debug network simulation profiles are deterministic", () => {
  const perfect = collectNetworkPlan("perfect", 7);
  assert(perfect.dropped === 0, "perfect profile should not drop packets");
  assert(
    perfect.duplicated === 0,
    "perfect profile should not duplicate packets",
  );
  assert(perfect.reordered === 0, "perfect profile should not reorder packets");
  assert(
    perfect.delays.every((delay) => delay === 0),
    "perfect profile should deliver without added delay",
  );

  const mild = collectNetworkPlan("mild", 42);
  assert(mild.dropped > 0, "mild profile should drop some packets");
  assert(mild.duplicated > 0, "mild profile should duplicate some packets");
  assert(mild.reordered > 0, "mild profile should reorder some packets");
  assert(
    mild.delays.every((delay) => delay >= 0 && delay <= 115),
    "mild profile should keep delays within its configured range",
  );

  const first = collectNetworkPlan("bad", 42);
  const second = collectNetworkPlan("bad", 42);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "same profile and seed should produce same plan",
  );
  assert(first.dropped > 0, "bad profile should drop some packets");
  assert(first.duplicated > 0, "bad profile should duplicate some packets");
  assert(first.reordered > 0, "bad profile should reorder some packets");
});

function makeSnapshotTimes(
  startMs: number,
  durationMs: number,
  intervalMs: number,
  jitter: (index: number) => number = () => 0,
): number[] {
  const times: number[] = [];
  for (
    let index = 0, timeMs = startMs;
    timeMs <= durationMs;
    index += 1, timeMs += intervalMs
  ) {
    times.push(Math.max(0, timeMs + jitter(index)));
  }
  return times.sort((left, right) => left - right);
}

function simulateInterpolation(options: {
  durationMs: number;
  snapshotTimes: number[];
  positionAtTick: (tickNumber: number) => { x: number; y: number };
}): {
  snapCount: number;
  extrapolatedFramesAfterWarmup: number;
  maxExtrapolationTicks: number;
  maxConsecutiveCorrectionFlips: number;
  localRmsResidual: number;
} {
  const state = new ClientWorldState(8);
  const interpolator = new Interpolator({
    snapDistance: 192,
    expectedSnapshotMs: 50,
    minRenderDelayTicks: 2,
    maxRenderDelayTicks: 5,
    maxExtrapolationTicks: 0.35,
    jitterBufferMultiplier: 3,
    jitterBufferSafetyMs: 35,
  });
  let nextSnapshotIndex = 0;
  const samples: Array<{ time: number; x: number }> = [];
  let maxExtrapolationTicks = 0;
  let extrapolatedFramesAfterWarmup = 0;
  let lastCorrectionSign = 0;
  let consecutiveCorrectionFlips = 0;
  let maxConsecutiveCorrectionFlips = 0;

  for (
    let frameTimeMs = 0;
    frameTimeMs <= options.durationMs;
    frameTimeMs += 1000 / 60
  ) {
    while (
      nextSnapshotIndex < options.snapshotTimes.length &&
      (options.snapshotTimes[nextSnapshotIndex] ?? Number.POSITIVE_INFINITY) <=
        frameTimeMs
    ) {
      const tickNumber = nextSnapshotIndex + 1;
      const position = options.positionAtTick(tickNumber);
      state.pushSnapshot(
        makeSnapshot(tickNumber, [
          makePlayerSnapshot(1, position.x, position.y),
        ]),
        options.snapshotTimes[nextSnapshotIndex],
      );
      nextSnapshotIndex += 1;
    }

    interpolator.updateInterpolation(state, frameTimeMs, 1000 / 60, 1);
    const metrics = interpolator.getLatestDebugFrame();
    if (!metrics?.localPlayer) {
      continue;
    }
    if (frameTimeMs >= 500) {
      samples.push({ time: frameTimeMs, x: metrics.localPlayer.renderedX });
      if (metrics.interpolationMode === "extrapolate") {
        extrapolatedFramesAfterWarmup += 1;
      }
      if (metrics.localPlayer.overrunTicks !== null) {
        maxExtrapolationTicks = Math.max(
          maxExtrapolationTicks,
          metrics.localPlayer.overrunTicks,
        );
      }
      const sign = Math.sign(metrics.correctionDirectionX);
      if (
        sign !== 0 &&
        lastCorrectionSign !== 0 &&
        sign !== lastCorrectionSign
      ) {
        consecutiveCorrectionFlips += 1;
        maxConsecutiveCorrectionFlips = Math.max(
          maxConsecutiveCorrectionFlips,
          consecutiveCorrectionFlips,
        );
      } else if (sign !== 0) {
        consecutiveCorrectionFlips = 0;
      }
      if (sign !== 0) {
        lastCorrectionSign = sign;
      }
    }
  }

  const latest = interpolator.getLatestDebugFrame();
  return {
    snapCount: latest?.snapCount ?? 0,
    extrapolatedFramesAfterWarmup,
    maxExtrapolationTicks,
    maxConsecutiveCorrectionFlips,
    localRmsResidual: computeLinearResidualRms(samples),
  };
}

function makeInventorySnapshot(): InventorySnapshot {
  return {
    resources: [],
    hotbarSlots: Array.from({ length: 10 }, () => ({ kind: "empty" })),
    selectedHotbarIndex: 0,
    unlockedRecipeTypeIds: [],
  };
}

function makePlayerSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "player" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "player",
    typeId: "player:base",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: [{ width: 32, height: 32, offsetX: 0, offsetY: 0 }],
    hp: 100,
    maxHp: 100,
    alive: true,
    name: `player-${id}`,
    inventory: makeInventorySnapshot(),
    activeEffects: [],
    moveSpeed: 15,
    food: 100,
    maxFood: 100,
    ...overrides,
  };
}

function makeSnapshot(
  tickNumber: number,
  entities: EntitySnapshot[],
  full = true,
): WorldSnapshot {
  return {
    tick: tickNumber,
    lastProcessedSeq: tickNumber,
    dayNight: {
      dayCount: 0,
      phase: "day",
      phaseElapsedMs: tickNumber * 50,
      dayDurationMs: 120000,
      nightDurationMs: 60000,
    },
    full,
    entities,
    removedEntityIds: [],
    events: [],
  };
}

function makeFakeApp(): FakePixiApp {
  return {
    screen: { width: 1000, height: 800 },
    canvas: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
      }),
    },
  } as unknown as FakePixiApp;
}

function makeFakeContainer(): FakePixiContainer {
  return {
    pivot: makePoint(),
    scale: makePoint(1, 1),
    position: makePoint(),
  } as unknown as FakePixiContainer;
}

function makePoint(
  initialX = 0,
  initialY = 0,
): {
  x: number;
  y: number;
  set: (x: number, y: number) => void;
} {
  return {
    x: initialX,
    y: initialY,
    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    },
  };
}

function simulateCameraIdleRms(): number {
  const viewport = new PixiViewportController({ w: 10000, h: 7000 });
  const app = makeFakeApp();
  const root = makeFakeContainer();
  viewport.setCameraTarget(500, 500);
  const deltas: number[] = [];
  for (let frame = 0; frame < 240; frame += 1) {
    viewport.setCameraTarget(500, 500);
    viewport.update(1000 / 60, app, root);
    if (frame >= 60) {
      const state = viewport.getCameraDebugState(app);
      deltas.push(Math.hypot(state.screenDeltaX, state.screenDeltaY));
    }
  }
  return rms(deltas);
}

function simulateCameraMovementResidualRms(): number {
  const viewport = new PixiViewportController({ w: 10000, h: 7000 });
  const app = makeFakeApp();
  const root = makeFakeContainer();
  const samples: Array<{ time: number; x: number }> = [];
  for (let frame = 0; frame < 240; frame += 1) {
    const timeMs = frame * (1000 / 60);
    viewport.setCameraTarget(500 + timeMs * 0.3, 500);
    viewport.update(1000 / 60, app, root);
    if (frame >= 60) {
      const state = viewport.getCameraDebugState(app);
      samples.push({ time: timeMs, x: state.x });
    }
  }
  return computeLinearResidualRms(samples);
}

function collectNetworkPlan(
  profileName: "perfect" | "mild" | "bad",
  seed: number,
): {
  dropped: number;
  duplicated: number;
  reordered: number;
  delays: number[];
} {
  const simulator = new DebugNetworkSimulator();
  simulator.configure({ profileName, seed, enabled: true });
  const delays: number[] = [];
  for (let index = 0; index < 300; index += 1) {
    for (const delivery of simulator.planDeliveries(`packet-${index}`)) {
      delays.push(Math.round(delivery.delayMs));
    }
  }
  const metrics = simulator.getMetrics();
  return {
    dropped: metrics.droppedPacketCount,
    duplicated: metrics.duplicatedPacketCount,
    reordered: metrics.reorderedPacketCount,
    delays,
  };
}

function computeLinearResidualRms(
  samples: Array<{ time: number; x: number }>,
): number {
  if (samples.length < 2) {
    return 0;
  }
  const n = samples.length;
  const meanTime =
    samples.reduce((total, sample) => total + sample.time, 0) / n;
  const meanX = samples.reduce((total, sample) => total + sample.x, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const sample of samples) {
    const timeOffset = sample.time - meanTime;
    covariance += timeOffset * (sample.x - meanX);
    variance += timeOffset * timeOffset;
  }
  const slope = variance <= Number.EPSILON ? 0 : covariance / variance;
  const intercept = meanX - slope * meanTime;
  const residuals = samples.map(
    (sample) => sample.x - (slope * sample.time + intercept),
  );
  return rms(residuals);
}

function rms(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.sqrt(
    values.reduce((total, value) => total + value * value, 0) / values.length,
  );
}

bootstrapTypeRegistries();

let passed = 0;
for (const testCase of tests) {
  try {
    testCase.run();
    passed += 1;
    console.log(`ok ${passed} - ${testCase.name}`);
  } catch (error) {
    console.error(`not ok ${passed + 1} - ${testCase.name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

console.log(`netcode validation passed: ${passed}/${tests.length}`);

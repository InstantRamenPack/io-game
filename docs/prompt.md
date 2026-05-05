I used your pasted prompt as the base and rewrote it to require **Bun’s native `bun:test`** and the repo’s existing **`seedrandom`** dependency instead of custom assertions or a custom deterministic RNG.

````md id="rewritten-testing-prompt"
You are strengthening the entire test coverage of `InstantRamenPack/io-game`.

Your task is to rewrite and extend the test suite so that it catches real gameplay regressions, especially collision bugs, netcode jitter, local-player latency, snapshot/interpolation issues, protocol/schema drift, gameplay authority bugs, and performance/correctness regressions.

The current repo has meaningful test-like coverage, especially in `scripts/netcode.test.ts`, but the current tests can pass even when real gameplay under the bad network profile is visibly jittery. This is unacceptable.

Primary goal:
Build a robust, maintainable, high-signal test suite that protects the Minecraft-style collision and netcode pipeline.

Secondary goal:
Make `bun run test` the canonical correctness entrypoint.

Important limitation:
It is impossible to literally test “all possible cases” exhaustively because the state space is infinite. Instead, cover all meaningful behavioral classes, edge-case boundaries, invariants, combinatorial matrices, deterministic fuzz/property-style scenarios, and regression cases. Whenever exhaustive testing is impossible, add deterministic randomized/fuzz coverage with seeded reproducibility.

Do not remove existing tests unless replacing them with stronger equivalent coverage.

---

# 0. Current known test/implementation context

Before changing code, inspect these files:

- `package.json`
- `scripts/netcode.test.ts`
- `scripts/optimization.test.ts`
- `scripts/benchmarks/collision.benchmark.ts`
- `apps/client/src/net/Interpolator.ts`
- `apps/client/src/net/ClientEntity.ts`
- `apps/client/src/net/ClientWorldState.ts`
- `apps/client/src/net/DebugNetworkSimulator.ts`
- `apps/client/src/net/WsClient.ts`
- `apps/client/src/client/GameClient.ts`
- `apps/server/src/systems/CollisionSystem.ts`
- `apps/server/src/world/SpatialIndex.ts`
- `apps/server/src/world/StaticGeometryIndex.ts`
- `apps/server/src/net/SnapshotManager.ts`
- `apps/server/src/server/matchmaking/GameInstanceRuntime.ts`
- `apps/server/src/entities/Player.ts`
- `apps/server/src/world/World.ts`
- `packages/shared/src/net/protocol.ts`
- `packages/shared/src/net/snapshots.ts`
- `packages/shared/src/config/GameConfig.ts`

Known current characteristics:

- `package.json` has `build`, `typecheck`, `lint`, and benchmarks, but no canonical `test` script.
- `scripts/netcode.test.ts` is a large hand-rolled test harness covering mixed concerns.
- The client has `ClientWorldState`, `ClientEntity`, and `Interpolator` for snapshot buffering, frame history, interpolation, hold, extrapolation, jitter estimates, render delay, and debug frames.
- The debug network simulator can model latency, jitter, packet loss, duplication, and reordering.
- The server sends snapshots containing `lastProcessedSeq`.
- The collision system includes static clipping, dynamic-dynamic wall-safe correction, correction scale/clamp, deterministic candidate sorting, and bounded dynamic solver iterations.
- Config exposes collision and interpolation settings.
- The repo already uses `seedrandom`; do not introduce another RNG package or write a custom RNG algorithm.
- Use Bun’s native test runner from `bun:test`; do not write a custom test runner or generic assertion framework.

---

# 1. Test framework requirement

Use Bun’s built-in test runner.

Do not create a custom test runner.
Do not create generic assertion helpers that duplicate Bun’s `expect`.

Every test file must use imports from `bun:test`, for example:

```ts
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
```
````

Use Bun/Jest-style matchers for generic assertions:

- `toBe`
- `toEqual`
- `toStrictEqual`
- `toBeCloseTo`
- `toBeGreaterThan`
- `toBeGreaterThanOrEqual`
- `toBeLessThan`
- `toBeLessThanOrEqual`
- `toContain`
- `toHaveLength`
- `toThrow`
- `toHaveBeenCalled`
- `toHaveBeenCalledTimes`

Use Bun test features where appropriate:

- `describe(...)` for grouping
- `test(...)` for individual cases
- `test.each(...)` for scenario matrices
- `test.todo(...)` for planned prediction tests that cannot pass yet
- `test.skip(...)` only for tests that cannot run in the current environment
- `beforeAll(...)` for registry bootstrap
- `beforeEach(...)` for isolated world/client setup
- `mock(...)` and `spyOn(...)` for fake transport/renderer behavior

Do not create `scripts/tests/helpers/assert.ts`.
Do not create `scripts/tests/helpers/testRunner.ts`.

You may create domain-specific expectation helpers, but they must internally use Bun’s `expect`, not a custom assertion system.

Examples of allowed domain-specific helpers:

```ts
expectNoDynamicStaticOverlap(world);
expectAllEntityPositionsFinite(world);
expectNoDynamicEntityOutsideWorld(world);
expectSmoothMotion(metrics, thresholds);
expectSnapshotAccepted(state, snapshot);
expectPendingInputs(prediction, expectedSeqs);
```

Example style:

```ts
import { expect } from "bun:test";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { World } from "@server/world/World.ts";

export function expectNoDynamicStaticOverlap(world: World): void {
  for (const entity of world.entities.all()) {
    if (entity.collisionMode !== "dynamic") continue;

    const bounds = entity.getWorldBounds();
    const blockers = world.staticGeometry.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );

    for (const blocker of blockers) {
      if (blocker.entityId === entity.id) continue;

      expect(
        doResolvedRectSetsOverlap(entity.getWorldHitboxes(), blocker.hitboxes),
        `dynamic entity ${entity.id} overlaps static blocker ${blocker.entityId}`,
      ).toBe(false);
    }
  }
}
```

---

# 2. Deterministic RNG requirement

Use the existing `seedrandom` dependency for deterministic randomized/fuzz tests.

Do not implement a custom PRNG.
Do not add another RNG package.
Do not use `Math.random()` in tests.

Create only a thin test helper wrapper around `seedrandom` if it improves readability.

Create:

```text
scripts/tests/helpers/testRng.ts
```

Suggested implementation:

```ts
import seedrandom from "seedrandom";

export function makeTestRng(seed: string | number): seedrandom.PRNG {
  return seedrandom(String(seed));
}

export function rngFloat(
  rng: seedrandom.PRNG,
  minInclusive: number,
  maxExclusive: number,
): number {
  return minInclusive + rng() * (maxExclusive - minInclusive);
}

export function rngInt(
  rng: seedrandom.PRNG,
  minInclusive: number,
  maxInclusive: number,
): number {
  return Math.floor(rngFloat(rng, minInclusive, maxInclusive + 1));
}

export function rngBool(rng: seedrandom.PRNG, probability = 0.5): boolean {
  return rng() < probability;
}

export function rngPick<T>(rng: seedrandom.PRNG, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error("rngPick requires a non-empty array");
  }
  return values[rngInt(rng, 0, values.length - 1)]!;
}
```

Rules:

- All fuzz/property-style tests must use `seedrandom`.
- Every fuzz failure must print the failing seed and scenario description.
- Use `world.randomNumberGenerator` when testing world behavior that already depends on the authoritative world RNG.
- Use `makeTestRng(seed)` for standalone randomized test generation.
- Never use `Math.random()` in tests.

---

# 3. Canonical test scripts

Modify `package.json`.

Use Bun’s native test runner as the canonical test entrypoint:

```json
{
  "scripts": {
    "test": "bun test scripts/tests",
    "test:netcode": "bun test scripts/tests/netcode",
    "test:prediction": "bun test scripts/tests/prediction",
    "test:collision": "bun test scripts/tests/collision",
    "test:protocol": "bun test scripts/tests/protocol",
    "test:snapshot": "bun test scripts/tests/snapshot",
    "test:gameplay": "bun test scripts/tests/gameplay",
    "test:coverage": "bun test --coverage scripts/tests",
    "test:smoke": "bun run test && bun run benchmark:smoke",
    "benchmark:smoke": "BENCH_WARMUP_TICKS=5 BENCH_SAMPLE_TICKS=20 BENCH_COLLISION_ENEMIES=50 BENCH_COLLISION_WALLS=50 BENCH_COLLISION_PROJECTILES=20 bun run scripts/benchmarks/collision.benchmark.ts"
  }
}
```

Do not depend on long benchmarks for correctness tests.

`bun run test` must run correctness tests only.

---

# 4. Test file structure

Do not keep adding unrelated cases to `scripts/netcode.test.ts`.

Create this structure:

```text
scripts/tests/
  helpers/
    fakeNetwork.ts
    worldFixtures.ts
    snapshotFixtures.ts
    interpolationFixtures.ts
    collisionExpectations.ts
    smoothnessMetrics.ts
    testRng.ts

  netcode/
    current-netcode-scope.test.ts
    server-input-sequence.test.ts
    client-world-state.test.ts
    interpolator-sampling.test.ts
    interpolator-timing.test.ts
    interpolator-smoothness.test.ts
    projectile-interpolation.test.ts
    debug-network-simulator.test.ts
    websocket-client.test.ts
    local-player-latency.test.ts

  prediction/
    pending-input-queue.test.ts
    reconciliation.test.ts
    prediction-movement-parity.test.ts
    prediction-interpolator-skip.test.ts
    no-action-prediction.test.ts

  collision/
    static-clipping.test.ts
    dynamic-dynamic-wall-safe.test.ts
    item-collision-rules.test.ts
    spatial-index.test.ts
    static-geometry-index.test.ts
    collision-fuzz.test.ts

  protocol/
    protocol-parser.test.ts
    fast-input-parser-equivalence.test.ts
    snapshot-schema.test.ts
    compat-descriptor.test.ts

  snapshot/
    snapshot-manager-aoi.test.ts
    snapshot-manager-delta-full.test.ts
    snapshot-client-application.test.ts

  gameplay/
    action-sequence.test.ts
    inventory-authority.test.ts
    build-placement-authority.test.ts
    respawn-death-discontinuity.test.ts

  performance/
    benchmark-smoke.test.ts
```

If a full migration is too large for one pass, keep `scripts/netcode.test.ts` as a compatibility wrapper or legacy file, but new tests must live under `scripts/tests/...`.

---

# 5. Document the old `netcode.test.ts`

If `scripts/netcode.test.ts` remains, add this comment at the top:

```ts
/**
 * Legacy aggregate netcode test harness.
 *
 * This file historically covered many unrelated systems:
 * - server input sequencing
 * - protocol rejection
 * - authoritative movement
 * - snapshot duplicate/out-of-order rejection
 * - interpolation sampling
 * - synthetic jitter/loss cases
 * - camera stability
 * - debug network simulator determinism
 * - spawn/despawn handling
 * - death/respawn interpolation discontinuity
 * - snapshot history bounds
 *
 * This is not a complete perceptual netcode-quality test.
 * Position residual alone can report zero error even when motion is visibly jittery,
 * because delayed or uneven motion can still lie on a fitted line.
 *
 * New tests should live under `scripts/tests/...` and should include derivative
 * smoothness metrics: velocity variance, acceleration, jerk, freeze frames,
 * reverse frames, large steps, interpolation mode ratios, render-delay adaptation,
 * and local-player input-to-visual latency.
 *
 * Tests use Bun's native `bun:test` runner and `expect`.
 * Deterministic fuzz/randomized tests use the existing `seedrandom` package.
 */
```

---

# 6. Global test helpers

## 6.1 Snapshot fixtures

Create `scripts/tests/helpers/snapshotFixtures.ts`.

Add factory helpers:

```ts
makeInventorySnapshot()
makePlayerSnapshot(id, x, y, overrides?)
makeEnemySnapshot(id, x, y, overrides?)
makeProjectileSnapshot(id, x, y, overrides?)
makeBuildingSnapshot(id, x, y, overrides?)
makeStructureSnapshot(id, x, y, overrides?)
makePickupSnapshot(id, x, y, overrides?)
makeDayNightSnapshot(tick?)
makeSnapshot(tick, entities, options?)
```

Factories must create schema-valid snapshots by default.

## 6.2 World fixtures

Create `scripts/tests/helpers/worldFixtures.ts`.

Add:

```ts
bootstrapTestRegistries()
makeTestConfig(overrides?)
makeRuntime(overrides?)
connectTestClient(runtime, clientId?, name?)
spawnWall(runtime, x, y, options?)
spawnEnemy(runtime, type, x, y)
spawnPlayerLikeDynamic(runtime, x, y)
tick(runtime, count, beforeEachTick?)
```

Use `beforeAll(bootstrapTestRegistries)` in test files that require registries.

## 6.3 Collision expectation helpers

Create `scripts/tests/helpers/collisionExpectations.ts`.

Add domain-specific helpers that internally use `expect`:

```ts
expectNoDynamicStaticOverlap(world)
expectNoDynamicEntityOutsideWorld(world)
expectAllEntityPositionsFinite(world)
expectDynamicOverlapState(world, expected?)
expectEntityDoesNotOverlapBlocker(entity, blocker)
expectEntityMovedNoMoreThan(entityBefore, entityAfter, maxDistance)
```

`expectNoDynamicStaticOverlap(world)` must query `world.staticGeometry.queryBox(...)` for each dynamic entity and assert no resolved hitbox overlap.

Use these helpers aggressively after collision tests and benchmark smoke tests.

## 6.4 Smoothness metrics

Create `scripts/tests/helpers/smoothnessMetrics.ts`.

Define:

```ts
export type MotionSample = {
  timeMs: number;
  x: number;
  y: number;
};

export type FrameMotionDiagnostics = {
  frameIndex: number;
  timeMs: number;
  x: number;
  y: number;
  velocity: number;
  acceleration: number;
  jerk: number;
  mode?: string;
  renderDelayTicks?: number;
};

export type SmoothnessMetrics = {
  sampleCount: number;

  positionResidualRms: number;
  positionMaxStep: number;

  velocityMean: number;
  velocityMedian: number;
  velocityStdDev: number;
  velocityCoeffVar: number;
  velocityP95AbsDelta: number;
  velocityMaxAbsDelta: number;

  accelerationRms: number;
  accelerationP95: number;
  accelerationMax: number;

  jerkRms: number;
  jerkP95: number;
  jerkMax: number;

  freezeFrameCount: number;
  reverseFrameCount: number;
  largeStepCount: number;

  worstFrames: FrameMotionDiagnostics[];
};
```

Implement:

```ts
computeSmoothnessMetrics(samples, expectedDirection, options?)
computeLinearResidualRms(samples)
percentile(values, q)
median(values)
stdDev(values)
summarizeInterpolationModes(debugFrames, warmupMs)
```

Smoothness rules:

- Velocity is frame-to-frame displacement / dt seconds.
- Project velocity onto expected direction.
- Acceleration is change in projected velocity / dt seconds.
- Jerk is change in acceleration / dt seconds.
- Freeze frame means projected speed is below `freezeEpsilon` while expected movement continues.
- Reverse frame means projected velocity is negative when expected direction is positive.
- Large step means velocity delta exceeds `largeStepMultiplier * medianVelocityDelta`.

Do not let `computeLinearResidualRms()` be the only metric.

---

# 7. Netcode rewrite: robust coverage

## 7.1 Preserve existing categories

Migrate or preserve tests that currently validate:

- server-authoritative movement from input intent
- input protocol rejects authoritative `x`/`y`
- stale/duplicate input ignored
- out-of-order input ignored
- movement stops when input stops
- movement stops when fresh input is missing
- diagonal movement normalized
- server collision blocks static wall traversal
- snapshot receiver ignores duplicate and out-of-order snapshots
- steady snapshots render smoothly at 60 FPS
- jittered start/stop remains bounded
- direction changes do not cause correction buzz
- packet loss burst uses bounded extrapolation
- variable latency stays bounded
- entity spawn/despawn handled
- incomplete delta-only new entities wait for complete keyframe
- death/respawn discontinuities reset interpolation history
- snapshot history remains bounded
- local/remote players render from authoritative snapshots in current implementation
- camera idle/movement stability
- debug network simulator profiles are deterministic

Do not delete these. Upgrade weak assertions where necessary.

## 7.2 Replace weak interpolation confidence

Current style may pass with zero residual while gameplay is visibly jittery.

Add these new tests in:

```text
scripts/tests/netcode/interpolator-smoothness.test.ts
```

Each test must use `describe`, `test`, and `expect` from `bun:test`.

### Test: perfect network produces stable remote velocity

Scenario:

- One remote entity moves right at constant velocity.
- Server snapshots every 50ms.
- Render frames every 16.666ms.
- Network profile: perfect.
- Duration: 5 seconds.
- Warmup: 500ms.

Expected:

```text
velocityCoeffVar <= 0.08
freezeFrameCount === 0
reverseFrameCount === 0
largeStepCount === 0
snapCount === 0
extrapolate ratio after warmup === 0
interpolate ratio after warmup >= 0.95
```

### Test: mild network remains smooth enough

Scenario:

- Same constant motion.
- Debug profile: mild.
- Seeds: 1, 2, 3, 42, 99.
- Duration: 8 seconds.

Expected:

```text
velocityCoeffVar <= 0.22
freezeFrameCount <= 2
reverseFrameCount === 0
largeStepCount <= 2
snapCount === 0
interpolate ratio after warmup >= 0.85
renderDelayTicks within min/max
targetRenderDelayTicks within min/max
```

Use `test.each(...)` for the seed matrix.

### Test: bad network remote motion stays within smoothness thresholds

Scenario:

- Same constant motion.
- Debug profile: bad.
- Seeds: 1, 2, 3, 42, 99, 12345.
- Duration: 10 seconds.

Expected:

```text
velocityCoeffVar <= 0.40
freezeFrameCount <= 8
reverseFrameCount === 0
largeStepCount <= 8
snapCount === 0 unless discontinuity threshold is intentionally exceeded
interpolate ratio after warmup >= 0.70
extrapolate ratio after warmup <= 0.20
renderDelayTicks rises above min at least once
renderDelayTicks never exceeds max
```

If this fails with current implementation and real gameplay is visibly jittery, do not weaken the test. Keep the failure and tune the implementation.

### Test: bad network adaptive render delay reduces buffer underruns

Scenario:

- Run same bad network stream twice:
  1. adaptive delay enabled with normal defaults
  2. artificially fixed/minimal render delay, if configurable

- Compare mode ratios.

Expected:

```text
adaptive run has fewer hold/extrapolate frames
adaptive run has lower velocityCoeffVar
adaptive run has lower jerkP95
```

### Test: burst packet loss causes bounded visual damage then recovers

Scenario:

- Drop snapshots for ticks 25-32.
- Resume delivery after the burst.
- Constant-motion entity.

Expected:

```text
during burst: hold/extrapolate allowed
after burst: interpolate mode resumes
freeze frames limited to burst/recovery window
extrapolation overrun <= maxExtrapolationTicks
no permanent drift
no repeated snaps
```

### Test: delayed burst does not cause huge catch-up jump

Scenario:

- Delay 5 consecutive snapshots and deliver them close together.
- The client should reject stale/out-of-order as appropriate and render smoothly.

Expected:

```text
largeStepCount <= configured threshold
jerkP95 <= configured threshold
latestTick monotonic
duplicate/out-of-order counters accurate if applicable
```

## 7.3 Implement true networked snapshot simulation

Do not only hand-schedule snapshot times.

Create helper:

```ts
function simulateNetworkedSnapshotStream(options: {
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
};
```

Required behavior:

1. Generate authoritative snapshots at fixed server ticks.
2. Serialize them as snapshot messages.
3. Pass each message through `DebugNetworkSimulator.planDeliveries(...)`.
4. Deliver messages to `ClientWorldState.pushSnapshot(...)` at simulated delivery time.
5. Drive render frames at `frameMs`.
6. Call `Interpolator.updateInterpolation(...)`.
7. Record rendered entity positions and debug frames after warmup.
8. Compute smoothness metrics.

Important:
Do not push snapshots at original server time. Push snapshots at simulated delivery time.

## 7.4 Add render-delay adaptation tests

In `interpolator-timing.test.ts`, add:

### Test: perfect network keeps render delay near min

Expected:

```text
targetRenderDelayTicks approximately minRenderDelayTicks
renderDelayTicks stays within min + small tolerance
```

### Test: bad network increases target render delay above min

Expected:

```text
targetRenderDelayTicks > minRenderDelayTicks at least once
arrivalJitterMsEwma > 0
```

### Test: render delay clamps to max

Use extreme jitter.

Expected:

```text
renderDelayTicks <= maxRenderDelayTicks
targetRenderDelayTicks <= maxRenderDelayTicks
```

### Test: observed tick duration clamp lower bound

Use unrealistically fast snapshot arrivals.

Expected:

```text
observed tick duration does not fall below expectedSnapshotMs * tickDurationMinFactor
```

### Test: observed tick duration clamp upper bound

Use unrealistically slow snapshot arrivals.

Expected:

```text
observed tick duration does not exceed expectedSnapshotMs * tickDurationMaxFactor
```

## 7.5 Add interpolation sampling edge cases

In `interpolator-sampling.test.ts`, explicitly test:

| Case                                             | Expected                                  |
| ------------------------------------------------ | ----------------------------------------- |
| no server frame                                  | sample returns null                       |
| one frame only, non-projectile                   | hold                                      |
| one frame only, projectile and render tick ahead | extrapolate                               |
| renderTick before oldest                         | hold oldest                               |
| renderTick exactly oldest                        | hold/interpolate with alpha 0, but stable |
| renderTick between frames                        | interpolate                               |
| renderTick exactly next frame                    | alpha 1                                   |
| renderTick after latest                          | extrapolate capped                        |
| history limit reached                            | old frames pruned                         |
| discontinuity tick                               | snap only once                            |
| alive changes                                    | history reset                             |
| large position jump                              | discontinuity recorded                    |
| repeated same tick update                        | latest frame overwritten, not duplicated  |

Use `test.each(...)` where practical.

## 7.6 Projectile tests

In `projectile-interpolation.test.ts`, add:

| Test                                                  | Expected                   |
| ----------------------------------------------------- | -------------------------- |
| normal projectile uses estimated server tick sampling | can extrapolate forward    |
| homing drone does not bypass delayed render tick      | treated as server-delayed  |
| projectile extrapolation is capped                    | overrun <= max             |
| projectile with one frame and future render tick      | extrapolate                |
| projectile discontinuity                              | snap once, not every frame |
| projectile despawn                                    | render state pruned        |

## 7.7 Local player latency tests

Current local player movement is latency-bound without prediction. Add a test that explicitly documents this.

### Test: current local player rendering is latency-bound without prediction

Scenario:

- Simulate user pressing right at t=0.
- Network delay outbound + inbound using bad profile or fixed 150ms.
- Server processes input only after it arrives.
- Client sees local player move only after authoritative snapshot arrives.
- Measure input-to-visible-motion latency.

Expected current behavior:

```text
visible local movement latency > one frame
visible local movement latency roughly includes network/server delay
```

This test should not necessarily fail current code. It should print/return the measured latency and document the problem.

### Future test: Minecraft-style prediction moves local player immediately

Add with `test.todo(...)` if prediction is not implemented.

Acceptance once prediction exists:

```text
local player x changes within one client frame after input
pending input count increments
server snapshot reconciliation drops acknowledged inputs
remote entities still use Interpolator
```

## 7.8 Interpolator skip-local test

Prepare this now. If the implementation does not support skipping local player yet, use `test.todo(...)`.

Scenario:

- World has local player id 1 and remote entity id 2.
- Local visual x is predicted to 500.
- Server frames say local x is 100.
- Remote frames move from 100 to 200.
- Call interpolator with `skipEntityIds = new Set([1])`.

Expected:

```text
local x remains 500
remote x interpolates normally
```

This prevents the classic bug where prediction is overwritten by interpolation.

## 7.9 Failure diagnostics

Every bad-network smoothness test must print useful diagnostics on failure:

```ts
console.error({
  profileName,
  seed,
  metrics,
  modeSummary,
  snapshotStats,
  latestDebugFrame,
  worstFrames: metrics.worstFrames.slice(0, 10),
});
```

The failure output must make visible jitter diagnosable from CI logs.

---

# 8. Prediction/reconciliation tests

These tests should be added now if prediction classes exist. If prediction does not exist yet, add them as `test.todo(...)`, not as silently skipped tests.

## 8.1 Pending input queue

Test all cases:

| Case                            | Expected                                  |
| ------------------------------- | ----------------------------------------- |
| record input seq 1              | pending count 1                           |
| record seq 1,2,3 then ack 2     | only seq 3 remains                        |
| ack -1                          | nothing removed                           |
| ack higher than all pending     | queue empty                               |
| duplicate seq sent accidentally | either rejected or deterministic behavior |
| out-of-order pending insertion  | either sorted or explicit failure         |
| maxPendingInputs exceeded       | oldest pruned                             |
| maxClientPredictionMs exceeded  | stale inputs pruned                       |
| reset on disconnect             | queue empty                               |
| reset on session migration      | queue empty                               |
| reset on welcome/new player     | queue empty                               |

## 8.2 Reconciliation

Test:

| Case                             | Expected                                     |
| -------------------------------- | -------------------------------------------- |
| authoritative reset then replay  | final state = authoritative + unacked replay |
| acked inputs not replayed        | no double-application                        |
| unacked inputs replayed in order | deterministic                                |
| no pending inputs                | local equals authoritative                   |
| small error                      | smooth correction offset created             |
| large error                      | snap immediately                             |
| prediction disabled              | local equals authoritative, no replay        |
| dead player                      | no replay                                    |
| respawn/discontinuity            | queue reset or snap                          |
| stale snapshot ignored           | no reconciliation                            |

## 8.3 Client/server movement parity

Server movement uses movement booleans, normalization, speed, and state such as stun/effects. Test client prediction against server expectations.

Cases:

| Input               | Expected                                      |
| ------------------- | --------------------------------------------- |
| none                | zero velocity                                 |
| right               | positive x                                    |
| left                | negative x                                    |
| up                  | negative y                                    |
| down                | positive y                                    |
| right+down          | normalized magnitude <= speed                 |
| left+right          | zero x                                        |
| up+down             | zero y                                        |
| all four directions | zero vector or defined deterministic behavior |
| stunned             | zero movement                                 |
| speed multiplier    | scaled speed                                  |
| dead player         | no prediction                                 |

## 8.4 Prediction + collision

If client-side known-static collision is implemented:

| Case                                  | Expected                           |
| ------------------------------------- | ---------------------------------- |
| predicted player hits known wall      | does not visually pass through     |
| predicted player hits world bounds    | clamped                            |
| diagonal into corner                  | slides or clips deterministically  |
| unknown server-only wall              | server correction fixes divergence |
| stale client wall removed server-side | reconciliation handles mismatch    |

If client-side collision is not implemented:

- Add a test documenting visual wall penetration under latency as a known limitation.
- Do not mark it as passing correctness if the intended final goal is Minecraft-style feel.

## 8.5 No client prediction for authoritative actions

Prediction must not replay combat/inventory/build effects.

Test:

| Case                 | Expected                                    |
| -------------------- | ------------------------------------------- |
| attack action sent   | no local authoritative damage               |
| build action sent    | no permanent local structure until snapshot |
| craft action sent    | inventory unchanged until snapshot          |
| drop action sent     | item not permanently dropped until snapshot |
| pickup action sent   | item not removed until snapshot             |
| rejected action      | no ghost state                              |
| duplicate action seq | no double effect                            |

---

# 9. Collision tests

The current collision system has static clipping, wall-safe dynamic correction, dynamic push clamp/scale, item exceptions, candidate sorting, and bounded solver iterations. Test all of these.

## 9.1 Static clipping

In `static-clipping.test.ts`, add:

| Case                                     | Expected                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| dynamic moves into vertical wall         | stops before overlap                                                   |
| dynamic moves into horizontal wall       | stops before overlap                                                   |
| high-speed movement into thin wall       | no tunneling                                                           |
| diagonal movement into wall              | blocked axis clipped, free axis moves                                  |
| diagonal movement into corner            | no static penetration                                                  |
| starting touching wall and moving away   | movement succeeds                                                      |
| starting touching wall and moving inward | movement blocked                                                       |
| zero delta                               | no movement, no velocity corruption                                    |
| negative coordinates near world edge     | clamped or handled                                                     |
| exact boundary contact                   | no false overlap                                                       |
| world bounds left/right/top/bottom       | clamped                                                                |
| huge velocity                            | no NaN, no penetration                                                 |
| tiny velocity below epsilon              | stable                                                                 |
| overlapping static at spawn              | recovery attempts push out                                             |
| unrecoverable overlap                    | no NaN; velocity clipped; static hard constraint preserved if possible |

After each test:

```ts
expectAllEntityPositionsFinite(world);
expectNoDynamicEntityOutsideWorld(world);
expectNoDynamicStaticOverlap(world);
```

## 9.2 Dynamic-dynamic wall-safe correction

In `dynamic-dynamic-wall-safe.test.ts`, add:

| Case                                        | Expected                                                |
| ------------------------------------------- | ------------------------------------------------------- |
| two entities overlap in open space          | overlap reduced                                         |
| entity A next to wall, B overlaps A         | A not pushed into wall                                  |
| blocked correction transfers to free entity | B absorbs correction                                    |
| both entities blocked by walls              | residual overlap allowed; no static penetration         |
| large overlap with max correction 8         | movement per tick <= 8                                  |
| push scale 0.5                              | correction smaller than full even split                 |
| solver iterations 1 vs 2                    | 2 improves separation                                   |
| solver iterations max 8 respected           | no unbounded loop                                       |
| no overlaps                                 | no movement                                             |
| deterministic ordering                      | same final positions across insertion order             |
| dense crowd in small room                   | no static penetration; residual dynamic overlap allowed |
| long chain of entities against wall         | no wall clipping                                        |

## 9.3 Item collision rules

In `item-collision-rules.test.ts`, add:

| Pair                          | Expected                 |
| ----------------------------- | ------------------------ |
| player-player                 | resolves                 |
| player-enemy                  | resolves                 |
| enemy-enemy                   | resolves                 |
| player-item                   | does not physically push |
| enemy-item                    | does not physically push |
| mergeable item-item           | no push                  |
| non-mergeable item-item       | push                     |
| item near wall pushed by item | no static penetration    |

## 9.4 Collision fuzz/property tests

In `collision-fuzz.test.ts`, add deterministic fuzz using `seedrandom`.

For seeds 1..250:

1. Create random world size.
2. Spawn random static walls/buildings/structures.
3. Spawn random dynamic players/enemies/items.
4. Assign random velocities, including zero, tiny, normal, huge, diagonal, and opposing.
5. Tick 60 times.
6. After every tick assert:
   - no NaN/Infinity
   - dynamic entities inside world bounds
   - no dynamic-static overlap
   - collision tick terminates
   - entity count stable unless scenario intentionally despawns

Use:

```ts
import { describe, expect, test } from "bun:test";
import { makeTestRng, rngFloat, rngInt, rngPick } from "../helpers/testRng.ts";
```

On failure, print:

- seed
- tick
- entity count
- static blocker count
- scenario parameters
- failing entity id
- positions and velocities

Never use `Math.random()`.

## 9.5 SpatialIndex tests

In `spatial-index.test.ts`, add:

| Case                                        | Expected                              |
| ------------------------------------------- | ------------------------------------- |
| entity in one cell queried                  | returned                              |
| entity spanning multiple cells              | returned once                         |
| query empty region                          | empty                                 |
| moved entity updates buckets after sync     | old region absent, new region present |
| removed entity after sync                   | absent                                |
| reused output buffer                        | cleared correctly                     |
| exact cell edge                             | stable                                |
| negative coordinate                         | no key collision                      |
| huge coordinate within world                | stable                                |
| sync marker rollover simulated if possible  | no stale state                        |
| query marker rollover simulated if possible | no stale visited state                |

## 9.6 StaticGeometryIndex tests

Add analogous tests for static geometry:

- static-only entities indexed
- dynamic entities excluded
- collisionMode changes update index
- despawn removes blockers
- query returns blockers once
- hitbox version/position changes reflected after rebuild/sync

---

# 10. Snapshot replication tests

The server snapshot system must be tested independently from interpolation.

## 10.1 AOI tests

In `snapshot-manager-aoi.test.ts`, add:

| Case                                            | Expected                       |
| ----------------------------------------------- | ------------------------------ |
| local player included even if no other entities | included                       |
| entity inside interest radius                   | included                       |
| entity outside interest radius                  | excluded                       |
| entity crosses out of AOI                       | removedEntityIds includes it   |
| entity crosses back into AOI                    | full keyframe included         |
| despawned known entity                          | removedEntityIds includes it   |
| newly spawned entity inside AOI                 | full snapshot included         |
| newly spawned entity outside AOI                | not included                   |
| interest radius zero/small                      | only player included           |
| very large interest radius                      | all relevant entities included |

## 10.2 Delta/full behavior

In `snapshot-manager-delta-full.test.ts`, add:

| Case                                    | Expected                                   |
| --------------------------------------- | ------------------------------------------ |
| early ticks full                        | full true                                  |
| changed position sends delta            | entity included                            |
| unchanged entity omitted from delta     | omitted                                    |
| stable fields stripped                  | typeId/hitboxes omitted when known         |
| hitbox change sends full entity         | hitboxes included                          |
| periodic full refresh                   | full entity resent after refresh ticks     |
| too many removals                       | full snapshot                              |
| too many updates                        | full snapshot                              |
| player-specific known state independent | client A/B replication states do not bleed |

## 10.3 Client snapshot application

In `snapshot-client-application.test.ts`, add:

| Case                                     | Expected                        |
| ---------------------------------------- | ------------------------------- |
| full snapshot creates world              | clientWorld exists              |
| delta updates existing entity            | serverX/serverY update          |
| incomplete delta-only new entity ignored | not created                     |
| complete later keyframe creates entity   | created                         |
| removed ids delete entities              | removed                         |
| full snapshot omits entity               | deleted                         |
| duplicate tick ignored                   | duplicate counter increments    |
| older tick ignored                       | out-of-order counter increments |
| latest tick never rolls back             | monotonic                       |
| snapshot history bounded                 | length <= limit                 |
| entity frame history bounded             | length <= limit                 |
| dayNight updates                         | latest state reflected          |
| events copied                            | event array updated             |

---

# 11. Protocol and schema tests

## 11.1 Protocol parser tests

In `protocol-parser.test.ts`, add valid/invalid matrices.

### Input message cases

Valid:

- seq 0
- large integer seq within safe integer if allowed
- clientTimeMs omitted
- clientTimeMs finite
- theta 0, pi, -pi, huge finite angle normalized
- all movement boolean combinations

Invalid:

- negative seq
- fractional seq
- NaN/Infinity theta
- missing movement
- movement missing one key
- movement has extra key
- movement non-boolean
- extra x/y fields
- extra unknown fields
- wrong `t`
- malformed JSON
- array JSON
- null JSON
- huge malicious payload if size checks exist

### Action cases

For each action type:

- valid minimum payload
- stale/duplicate sequence tested server-side
- missing required field invalid
- wrong type invalid
- extra field invalid if schema is strict
- boundary indices: min/max valid, below/above invalid

### Lobby/chat/ping/hello cases

- valid hello with/without optional fields
- empty compat hash invalid
- playerName sanitization server-side
- chat max length valid
- chat over max invalid
- lobby code valid patterns
- lobby code invalid characters/length

## 11.2 Fast input parser equivalence

In `fast-input-parser-equivalence.test.ts`, generate many input payloads.

For each payload:

```ts
const full = parseClientToServerMessage(raw);
const fast = parseFastInputMessage(raw);
```

Assert:

- if full accepts input, fast accepts equivalent normalized fields
- if full rejects input, fast rejects
- theta normalization matches
- strict extra fields rejected by both
- malformed JSON rejected by both

Include deterministic fuzz payloads with `seedrandom`.

## 11.3 Snapshot schema tests

In `snapshot-schema.test.ts`, add:

| Case                                                  | Expected                |
| ----------------------------------------------------- | ----------------------- |
| full valid player snapshot                            | parse success           |
| full valid enemy/building/structure/projectile/pickup | parse success           |
| delta existing entity without hitboxes                | schema success if valid |
| invalid negative tick                                 | reject                  |
| invalid lastProcessedSeq < -1                         | reject                  |
| invalid removed id                                    | reject                  |
| invalid hotbar length                                 | reject                  |
| invalid chest length                                  | reject                  |
| invalid entity kind                                   | reject                  |
| invalid resource id                                   | reject                  |
| invalid dayNight phase                                | reject                  |
| invalid event                                         | reject                  |

## 11.4 Compat descriptor tests

Test that protocol/snapshot compat descriptors cover current schema fields and fail on drift.

---

# 12. Gameplay authority tests

## 12.1 Input/action sequence

In `action-sequence.test.ts`, add:

| Case                                                                           | Expected                    |
| ------------------------------------------------------------------------------ | --------------------------- |
| stale input ignored                                                            | no movement override        |
| duplicate input ignored                                                        | no double effect            |
| out-of-order input ignored                                                     | latest wins                 |
| stale action ignored                                                           | no action effect            |
| duplicate action ignored                                                       | no double attack/build/drop |
| input seq and action seq independently tracked                                 | correct acceptance          |
| snapshot lastProcessedSeq is max of accepted input/action                      | monotonic                   |
| invalid input rejected                                                         | lastProcessedSeq unchanged  |
| invalid action rejected                                                        | lastProcessedSeq unchanged  |
| ignored stale input does not emit server error if current behavior says ignore | expected current behavior   |

## 12.2 Inventory authority

In `inventory-authority.test.ts`, add:

| Case                       | Expected                              |
| -------------------------- | ------------------------------------- |
| inventory move valid       | server snapshot reflects              |
| invalid slot               | no mutation                           |
| chest move too far         | no mutation                           |
| chest move valid           | mutation                              |
| drop selected item         | inventory decreases and item spawns   |
| pickup overlapping item    | inventory increases and item despawns |
| pickup when inventory full | item remains                          |
| recycle near recycler      | resource added                        |
| recycle away from recycler | no mutation                           |

## 12.3 Build placement authority

In `build-placement-authority.test.ts`, add:

| Case                            | Expected                  |
| ------------------------------- | ------------------------- |
| build within range and valid    | structure/building spawns |
| build out of range              | no spawn                  |
| build overlapping player        | no spawn                  |
| build overlapping static        | no spawn                  |
| build outside world bounds      | no spawn                  |
| build missing inventory         | no spawn                  |
| structure snapping grid correct | expected x/y              |
| build action duplicate seq      | only one spawn            |

## 12.4 Death/respawn

In `respawn-death-discontinuity.test.ts`, add:

| Case                            | Expected                     |
| ------------------------------- | ---------------------------- |
| death clears input/action state | no continued movement/action |
| death collision mode none       | no blocking if intended      |
| respawn restores collision mode | dynamic again                |
| respawn resets movement         | vx/vy zero                   |
| respawn snapshot discontinuity  | client history reset         |
| respawn position within world   | true                         |
| duplicate respawn while alive   | no effect                    |

---

# 13. WebSocket/client transport tests

In `websocket-client.test.ts`, use a fake WebSocket implementation and Bun mocks/spies.

Use `mock` and `spyOn` from `bun:test` where useful.

Test:

| Case                                        | Expected            |
| ------------------------------------------- | ------------------- |
| connect sends hello                         | sent on open        |
| hello bypasses debug simulation             | immediate           |
| input sends seq/clientTimeMs/theta/movement | JSON shape correct  |
| action sends exact payload                  | JSON shape correct  |
| disconnected send is no-op                  | no throw            |
| inbound valid snapshot invokes handler      | called              |
| inbound malformed ignored                   | no crash            |
| inbound error invokes error handler         | called              |
| close clears socket                         | socket undefined    |
| debug outbound delay/drop works             | metrics update      |
| debug inbound delay/drop works              | metrics update      |
| disable debug clears timers                 | no delayed delivery |

---

# 14. Performance smoke and benchmark correctness

## 14.1 Smoke benchmark script

Add `benchmark:smoke` as described above.

## 14.2 Correctness checks inside collision benchmark

Modify `scripts/benchmarks/collision.benchmark.ts` or common benchmark harness to optionally run:

```ts
expectAllEntityPositionsFinite(runtime.world);
expectNoDynamicEntityOutsideWorld(runtime.world);
expectNoDynamicStaticOverlap(runtime.world);
```

Run after warmup and after sample.

If benchmark code cannot import test helpers because it runs outside Bun test, create shared non-test invariant utilities that throw `Error`, then wrap them with `expect` in test helpers.

## 14.3 Performance regression thresholds

For smoke tests:

- thresholds should catch catastrophic regressions only
- avoid flaky strict p95 thresholds in CI

For nightly/full benchmarks:

- retain existing p95/p99 thresholds
- write JSON reports
- compare against baseline when provided

---

# 15. CI workflow

Add GitHub Actions if absent.

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test
      - run: bun run build:client
```

Optional nightly benchmark workflow:

```yaml
name: Nightly Benchmarks

on:
  schedule:
    - cron: "0 9 * * *"

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run benchmark:all
```

---

# 16. Edge-case coverage matrix

Make sure the final tests cover these categories.

## Numeric boundaries

- zero
- negative where invalid
- very small epsilon values
- exact boundary contact
- huge finite values
- NaN/Infinity rejection
- integer max/min where applicable
- fractional where integer required
- repeated same tick/seq
- off-by-one tick/seq
- empty arrays
- max-size arrays
- missing optional fields
- missing required fields
- extra unknown fields

## Time/network boundaries

- perfect delivery
- fixed latency
- jitter
- asymmetric latency
- duplicate packets
- packet loss
- reordered delivery
- delayed burst
- loss burst
- server tick gaps
- snapshot duplicates
- out-of-order snapshots
- clock drift approximation
- render FPS 30/60/144
- tick rate 20 and non-default if supported
- long stalls
- reconnection/session migration

## Movement/collision boundaries

- no movement
- cardinal movement
- diagonal movement
- opposing inputs
- high speed
- tiny speed
- wall contact
- wall overlap
- corner contact
- dynamic crowd
- dynamic crowd near wall
- impossible packing
- world bounds
- spawn inside blocker
- item collision exceptions
- dense broadphase cell occupancy

## Snapshot/replication boundaries

- full snapshots
- delta snapshots
- missing stable fields
- complete new entity
- incomplete new entity
- removed entity
- entity leaves AOI
- entity re-enters AOI
- hitbox changes
- hp/alive changes
- day/night changes
- event relevance
- too many removed ids
- too many updates
- periodic full refresh

## Client rendering boundaries

- interpolation
- hold
- extrapolate
- snap
- discontinuity
- one-frame history
- max history
- projectile special cases
- camera idle
- camera constant motion
- camera teleports/snap
- presentation overrides
- local predicted player skipped by interpolator

## Gameplay authority boundaries

- input
- attack
- craft
- build
- inventory move
- chest move
- drop
- pickup
- recycle
- respawn
- invalid/stale/duplicate actions
- distance/range checks
- inventory capacity
- dead/alive state

---

# 17. Definition of done

The work is complete when:

1. `bun run test` exists and runs correctness tests through Bun’s native `bun test`.
2. Test files import from `bun:test`.
3. There is no custom generic assertion framework.
4. There is no custom test runner.
5. Deterministic randomized/fuzz tests use `seedrandom`, not `Math.random()` and not a custom PRNG.
6. The old `netcode.test.ts` scope and limitations are documented.
7. Netcode tests no longer rely on linear residual alone.
8. Bad-network tests use `DebugNetworkSimulator` delivery plans.
9. Bad-network tests measure:
   - velocity variation
   - acceleration
   - jerk
   - freeze frames
   - reverse frames
   - large steps
   - interpolation mode ratios
   - render delay adaptation

10. A visibly jittery bad-network stream can fail tests even if position residual is near zero.
11. Collision tests explicitly protect:

- no dynamic-static penetration
- wall-safe dynamic-dynamic correction
- correction clamp/scale
- item collision exceptions
- dense-crowd behavior
- seeded fuzz invariants

12. Snapshot tests protect:

- AOI inclusion/removal
- full/delta semantics
- stable field stripping
- incomplete delta entity handling
- history bounds

13. Protocol tests protect:

- strict schemas
- fast parser equivalence
- invalid payload rejection
- compat descriptor drift

14. Prediction tests either pass if prediction exists or are present as `test.todo(...)` cases describing the expected Minecraft-style behavior.
15. Gameplay authority tests prove client-side prediction does not mutate combat/inventory/building authority.
16. CI runs typecheck, lint, tests, and client build.
17. Failure output includes enough diagnostic detail to reproduce and debug:

- seed
- profile
- metrics
- mode ratios
- snapshot stats
- latest debug frame
- worst frames

18. Deterministic fuzz tests print the failing seed and scenario.
19. No test uses `Math.random()`.
20. No additional RNG package is introduced.

Do not weaken tests to make bad behavior pass. If the current implementation is jittery under bad network, the strengthened tests should expose that.

```

```

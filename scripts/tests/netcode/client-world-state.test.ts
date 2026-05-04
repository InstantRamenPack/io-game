import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import {
  makePlayerSnapshot,
  makeSnapshot,
} from "../helpers/snapshotFixtures.ts";

const HISTORY_LIMIT = 8;

describe("client world state", () => {
  test("snapshot receiver ignores duplicate and out-of-order snapshots", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 10, 10)]), 50);
    state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 20, 10)]), 100);
    state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 20, 10)]), 110);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 10, 10)]), 120);
    const stats = state.getSnapshotReceiveStats();
    expect(stats.duplicateSnapshotCount).toBe(1);
    expect(stats.outOfOrderSnapshotCount).toBe(1);
    expect(state.latestTick).toBe(2);
  });

  test("entity spawn and despawn are handled during interpolation", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
    state.pushSnapshot(
      makeSnapshot(2, [
        makePlayerSnapshot(1, 0, 0),
        makePlayerSnapshot(2, 50, 0),
      ]),
      100,
    );
    expect(state.clientWorld?.entities.has(2)).toBe(true);
    state.pushSnapshot(
      {
        ...makeSnapshot(3, [], { full: false }),
        removedEntityIds: [2],
      },
      150,
    );
    expect(state.clientWorld?.entities.has(2)).toBe(false);
  });

  test("incomplete delta-only new entities wait for a complete keyframe", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    const incompleteDelta = {
      id: 2,
      kind: "player",
      x: 50,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
    } as EntitySnapshot;

    state.pushSnapshot(makeSnapshot(1, [incompleteDelta], { full: false }), 50);
    expect(state.clientWorld?.entities.has(2)).toBe(false);

    state.pushSnapshot(
      makeSnapshot(2, [makePlayerSnapshot(2, 60, 0)], { full: false }),
      100,
    );
    const entity = state.clientWorld?.entities.get(2);
    expect(entity).toBeDefined();
    expect(entity?.serverX).toBeCloseTo(60, 3);
  });

  test("death and respawn discontinuities reset interpolation history", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 100, 100)]), 50);
    state.pushSnapshot(
      makeSnapshot(2, [
        makePlayerSnapshot(1, 100, 100, { alive: false, hp: 0 }),
      ]),
      100,
    );
    let entity = state.clientWorld?.entities.get(1);
    expect(entity).toBeDefined();
    expect(entity?.lastDiscontinuityTick).toBe(2);
    expect(entity?.getServerFrameHistoryLength()).toBe(1);

    state.pushSnapshot(makeSnapshot(3, [makePlayerSnapshot(1, 800, 600)]), 150);
    entity = state.clientWorld?.entities.get(1);
    expect(entity?.lastDiscontinuityTick).toBe(3);
    expect(entity?.x).toBeCloseTo(800, 3);
    expect(entity?.y).toBeCloseTo(600, 3);
  });

  test("snapshot history remains bounded", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
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
    expect(entity).toBeDefined();
    expect(entity?.getServerFrameHistoryLength()).toBeLessThanOrEqual(
      HISTORY_LIMIT,
    );
  });
});

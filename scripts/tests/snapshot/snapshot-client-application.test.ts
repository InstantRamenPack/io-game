import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import {
  makeDayNightSnapshot,
  makeEnemySnapshot,
  makePlayerSnapshot,
  makeSnapshot,
} from "../helpers/snapshotFixtures.ts";

const HISTORY_LIMIT = 6;

describe("snapshot client application", () => {
  test("full snapshot creates client world", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
    expect(state.clientWorld).toBeDefined();
    expect(state.clientWorld?.entities.has(1)).toBe(true);
  });

  test("delta updates existing entity", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
    state.pushSnapshot(
      makeSnapshot(2, [makePlayerSnapshot(1, 40, 0)], { full: false }),
      100,
    );
    const entity = state.clientWorld?.entities.get(1);
    expect(entity?.serverX).toBeCloseTo(40, 3);
  });

  test("incomplete delta-only new entities are ignored until complete", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    const incomplete = {
      id: 2,
      kind: "player",
      x: 10,
      y: 20,
      vx: 0,
      vy: 0,
      rotation: 0,
    } as EntitySnapshot;
    state.pushSnapshot(makeSnapshot(1, [incomplete], { full: false }), 50);
    expect(state.clientWorld?.entities.has(2)).toBe(false);

    state.pushSnapshot(
      makeSnapshot(2, [makePlayerSnapshot(2, 30, 40)], { full: false }),
      100,
    );
    expect(state.clientWorld?.entities.has(2)).toBe(true);
  });

  test("removed ids delete entities", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(
      makeSnapshot(1, [
        makePlayerSnapshot(1, 0, 0),
        makeEnemySnapshot(2, 20, 0),
      ]),
      50,
    );
    state.pushSnapshot(
      makeSnapshot(2, [], { full: false, removedEntityIds: [2] }),
      100,
    );
    expect(state.clientWorld?.entities.has(2)).toBe(false);
  });

  test("full snapshot omits entity deletes it", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(
      makeSnapshot(1, [
        makePlayerSnapshot(1, 0, 0),
        makeEnemySnapshot(2, 20, 0),
      ]),
      50,
    );
    state.pushSnapshot(
      makeSnapshot(2, [makePlayerSnapshot(1, 0, 0)]),
      100,
    );
    expect(state.clientWorld?.entities.has(2)).toBe(false);
  });

  test("snapshot and entity history remain bounded", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    const interpolator = new Interpolator({
      snapDistance: 192,
      expectedSnapshotMs: 50,
    });
    for (let tick = 1; tick <= 50; tick += 1) {
      state.pushSnapshot(
        makeSnapshot(tick, [makePlayerSnapshot(1, tick, 0)]),
        tick * 50,
      );
      interpolator.updateInterpolation(state, tick * 50, 16, 1);
    }
    expect(state.getSnapshotHistory().length).toBeLessThanOrEqual(HISTORY_LIMIT);
    const entity = state.clientWorld?.entities.get(1);
    expect(entity?.getServerFrameHistoryLength()).toBeLessThanOrEqual(
      HISTORY_LIMIT,
    );
  });

  test("day/night and events update", () => {
    const state = new ClientWorldState(HISTORY_LIMIT);
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
    const event = {
      type: "damage",
      payload: {
        sourceId: 1,
        targetId: 1,
        amount: 1,
        remainingHp: 99,
        maxHp: 100,
        x: 0,
        y: 0,
        isFatal: false,
      },
    } as const;
    state.pushSnapshot(
      makeSnapshot(2, [makePlayerSnapshot(1, 0, 0)], {
        dayNight: makeDayNightSnapshot(2),
        events: [event],
      }),
      100,
    );
    expect(state.clientWorld?.events).toEqual([event]);
    expect(state.clientWorld?.dayNight.phase).toBe("day");
  });
});

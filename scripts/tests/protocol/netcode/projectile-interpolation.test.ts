import { describe, expect, test } from "bun:test";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import {
  makeProjectileSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";

const MAX_EXTRAPOLATION = 0.35;

describe("projectile interpolation", () => {
  test("normal projectile uses estimated server tick sampling", () => {
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      snapDistance: 192,
      expectedSnapshotMs: 50,
      minRenderDelayTicks: 5,
      maxRenderDelayTicks: 5,
    });
    state.pushSnapshot(
      makeSnapshot(1, [makeProjectileSnapshot(1, 0, 0, { vx: 10, vy: 0 })]),
      0,
    );
    state.pushSnapshot(
      makeSnapshot(2, [makeProjectileSnapshot(1, 10, 0, { vx: 10, vy: 0 })]),
      50,
    );
    interpolator.updateInterpolation(state, 200, 16, 1);
    const frame = interpolator.getLatestDebugFrame();
    expect(frame?.interpolationMode).toBe("extrapolate");
    expect(frame?.localPlayer?.renderedX ?? 0).toBeGreaterThan(10);
  });

  test("homing drone does not bypass delayed render tick", () => {
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      snapDistance: 192,
      expectedSnapshotMs: 50,
      minRenderDelayTicks: 5,
      maxRenderDelayTicks: 5,
    });
    state.pushSnapshot(
      makeSnapshot(1, [
        makeProjectileSnapshot(1, 0, 0, {
          vx: 10,
          vy: 0,
          typeId: "projectile:homing_drone",
        }),
      ]),
      0,
    );
    state.pushSnapshot(
      makeSnapshot(2, [
        makeProjectileSnapshot(1, 10, 0, {
          vx: 10,
          vy: 0,
          typeId: "projectile:homing_drone",
        }),
      ]),
      50,
    );
    interpolator.updateInterpolation(state, 200, 16, 1);
    const frame = interpolator.getLatestDebugFrame();
    expect(frame?.localPlayer?.overrunTicks ?? 0).toBeLessThanOrEqual(
      MAX_EXTRAPOLATION,
    );
    expect(frame?.interpolationMode).not.toBe("extrapolate");
  });

  test("projectile extrapolation is capped", () => {
    const entity = new ClientEntity(makeProjectileSnapshot(1, 0, 0), 1, 4);
    const sample = entity.samplePosition(10, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("extrapolate");
    if (sample?.mode === "extrapolate") {
      expect(sample.overrunTicks).toBeLessThanOrEqual(MAX_EXTRAPOLATION);
    }
  });

  test("projectile with one frame and future render tick extrapolates", () => {
    const entity = new ClientEntity(makeProjectileSnapshot(1, 0, 0), 1, 4);
    const sample = entity.samplePosition(2, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("extrapolate");
  });

  test("projectile discontinuity snaps once", () => {
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      snapDistance: 32,
      expectedSnapshotMs: 50,
    });
    state.pushSnapshot(
      makeSnapshot(1, [makeProjectileSnapshot(1, 0, 0, { vx: 10, vy: 0 })]),
      50,
    );
    state.pushSnapshot(
      makeSnapshot(2, [makeProjectileSnapshot(1, 400, 0, { vx: 10, vy: 0 })]),
      100,
    );
    interpolator.updateInterpolation(state, 100, 16, 1);
    interpolator.updateInterpolation(state, 116, 16, 1);
    const firstSnap = interpolator.getLatestDebugFrame()?.snapCount ?? 0;
    interpolator.updateInterpolation(state, 132, 16, 1);
    const secondSnap = interpolator.getLatestDebugFrame()?.snapCount ?? 0;
    expect(secondSnap).toBe(firstSnap);
  });

  test("projectile despawn prunes render state", () => {
    const state = new ClientWorldState(4);
    state.pushSnapshot(makeSnapshot(1, [makeProjectileSnapshot(1, 0, 0)]), 50);
    expect(state.clientWorld?.entities.has(1)).toBe(true);
    state.pushSnapshot(
      makeSnapshot(2, [], { full: false, removedEntityIds: [1] }),
      100,
    );
    expect(state.clientWorld?.entities.has(1)).toBe(false);
  });
});

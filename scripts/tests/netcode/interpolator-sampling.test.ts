import { describe, expect, test } from "bun:test";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import {
  makePlayerSnapshot,
  makeProjectileSnapshot,
  makeSnapshot,
} from "../helpers/snapshotFixtures.ts";

const MAX_EXTRAPOLATION = 0.35;

function updateEntity(
  entity: ClientEntity,
  snapshot: EntitySnapshot,
  tick: number,
): void {
  entity.updateFromSnapshot(snapshot, tick, false);
}

describe("interpolator sampling edge cases", () => {
  test("no server frame returns null", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    (entity as unknown as { serverFrameHistory: unknown[] }).serverFrameHistory =
      [];
    expect(entity.samplePosition(1, MAX_EXTRAPOLATION)).toBeNull();
  });

  test("one frame only, non-projectile holds", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    const sample = entity.samplePosition(2, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("hold");
  });

  test("one frame only, projectile extrapolates when render tick ahead", () => {
    const entity = new ClientEntity(makeProjectileSnapshot(1, 0, 0), 1, 4);
    const sample = entity.samplePosition(2, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("extrapolate");
    if (sample?.mode === "extrapolate") {
      expect(sample.overrunTicks).toBeLessThanOrEqual(MAX_EXTRAPOLATION);
    }
  });

  test("render tick before oldest holds oldest", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 5, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 6);
    const sample = entity.samplePosition(4, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("hold");
    if (sample?.mode === "hold") {
      expect(sample.frame.tick).toBe(5);
    }
  });

  test("render tick exactly oldest holds stable", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 5, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 6);
    const sample = entity.samplePosition(5, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("hold");
  });

  test("render tick between frames interpolates", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 3);
    const sample = entity.samplePosition(2, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("interpolate");
    if (sample?.mode === "interpolate") {
      expect(sample.alpha).toBeGreaterThan(0);
      expect(sample.alpha).toBeLessThan(1);
    }
  });

  test("render tick exactly next frame uses alpha 1", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 3);
    const sample = entity.samplePosition(3, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("interpolate");
    if (sample?.mode === "interpolate") {
      expect(sample.alpha).toBeCloseTo(1, 3);
    }
  });

  test("render tick after latest extrapolates capped", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 2);
    const sample = entity.samplePosition(10, MAX_EXTRAPOLATION);
    expect(sample?.mode).toBe("extrapolate");
    if (sample?.mode === "extrapolate") {
      expect(sample.overrunTicks).toBeLessThanOrEqual(MAX_EXTRAPOLATION);
    }
  });

  test("history limit prunes old frames", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 3);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 2);
    updateEntity(entity, makePlayerSnapshot(1, 20, 0), 3);
    updateEntity(entity, makePlayerSnapshot(1, 30, 0), 4);
    expect(entity.getServerFrameHistoryLength()).toBeLessThanOrEqual(3);
  });

  test("alive changes reset history", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 5, 0, { alive: false }), 2);
    expect(entity.lastDiscontinuityTick).toBe(2);
    expect(entity.getServerFrameHistoryLength()).toBe(1);
  });

  test("large position jump records discontinuity", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 400, 0), 2);
    expect(entity.lastDiscontinuityTick).toBe(2);
  });

  test("repeated same tick update overwrites frame", () => {
    const entity = new ClientEntity(makePlayerSnapshot(1, 0, 0), 1, 4);
    updateEntity(entity, makePlayerSnapshot(1, 10, 0), 1);
    expect(entity.getServerFrameHistoryLength()).toBe(1);
  });

  test("discontinuity snap only once", () => {
    const state = new ClientWorldState(4);
    const interpolator = new Interpolator({
      snapDistance: 32,
      expectedSnapshotMs: 50,
    });
    state.pushSnapshot(makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]), 50);
    state.pushSnapshot(makeSnapshot(2, [makePlayerSnapshot(1, 500, 0)]), 100);
    interpolator.updateInterpolation(state, 100, 16, 1);
    const firstSnap = interpolator.getLatestDebugFrame()?.snapCount ?? 0;
    interpolator.updateInterpolation(state, 116, 16, 1);
    const secondSnap = interpolator.getLatestDebugFrame()?.snapCount ?? 0;
    expect(secondSnap).toBe(firstSnap);
  });
});

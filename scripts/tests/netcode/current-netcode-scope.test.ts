import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import {
  makePlayerSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";

const SNAPSHOT_MS = 50;

type FakePixiApp = Parameters<PixiViewportController["update"]>[1];
type FakePixiContainer = Parameters<PixiViewportController["update"]>[2];

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

function makePoint(initialX = 0, initialY = 0) {
  return {
    x: initialX,
    y: initialY,
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
    },
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

describe("current netcode scope", () => {
  test("local and remote players render from authoritative snapshots", () => {
    const state = new ClientWorldState(8);
    const interpolator = new Interpolator({
      snapDistance: 192,
      expectedSnapshotMs: SNAPSHOT_MS,
    });
    state.pushSnapshot(
      makeSnapshot(1, [
        makePlayerSnapshot(1, 0, 0),
        makePlayerSnapshot(2, 100, 0),
      ]),
      SNAPSHOT_MS,
    );
    state.pushSnapshot(
      makeSnapshot(2, [
        makePlayerSnapshot(1, 10, 0),
        makePlayerSnapshot(2, 110, 0),
      ]),
      SNAPSHOT_MS * 2,
    );
    interpolator.updateInterpolation(state, SNAPSHOT_MS * 2, 16, 1);
    const local = state.clientWorld?.entities.get(1);
    const remote = state.clientWorld?.entities.get(2);
    expect(local).toBeDefined();
    expect(remote).toBeDefined();
    expect(local!.x).toBeGreaterThanOrEqual(0);
    expect(local!.x).toBeLessThanOrEqual(10);
    expect(remote!.x).toBeGreaterThanOrEqual(100);
    expect(remote!.x).toBeLessThanOrEqual(110);
  });

  test("camera is stable during idle and smooth during constant movement", () => {
    const viewport = new PixiViewportController({ w: 10000, h: 7000 });
    const app = makeFakeApp();
    const root = makeFakeContainer();
    viewport.setCameraTarget(500, 500);
    const idleDeltas: number[] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      viewport.setCameraTarget(500, 500);
      viewport.update(1000 / 60, app, root);
      if (frame >= 60) {
        const state = viewport.getCameraDebugState(app);
        idleDeltas.push(Math.hypot(state.screenDeltaX, state.screenDeltaY));
      }
    }
    expect(rms(idleDeltas)).toBeLessThanOrEqual(0.5);

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
    expect(computeLinearResidualRms(samples)).toBeLessThanOrEqual(1.0);
  });
});

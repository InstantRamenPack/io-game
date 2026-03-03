import { describe, expect, test } from "bun:test";
import { Interpolator } from "@client/net/Interpolator.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

describe("Interpolator", () => {
  test("linearly interpolates entity position", () => {
    const interpolator = new Interpolator(2);
    const history: WorldSnapshot[] = [
      {
        tick: 10,
        timeMs: 500,
        entities: [
          {
            id: 1,
            kind: "player" as const,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            rotation: 0,
            radius: 10,
          },
        ],
        events: [],
      },
      {
        tick: 12,
        timeMs: 600,
        entities: [
          {
            id: 1,
            kind: "player" as const,
            x: 10,
            y: 0,
            vx: 0,
            vy: 0,
            rotation: 0,
            radius: 10,
          },
        ],
        events: [],
      },
    ];

    const sampledEntities = interpolator.sample(history, 11);
    const entitySnapshot = sampledEntities.get(1);

    expect(entitySnapshot).toBeDefined();
    expect(entitySnapshot?.x).toBe(5);
  });
});

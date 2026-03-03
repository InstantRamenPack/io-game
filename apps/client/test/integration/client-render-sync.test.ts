import { describe, expect, test } from "bun:test";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

describe("client render sync", () => {
  test("stores latest snapshot and syncs renderer map", () => {
    const state = new ClientWorldState(8);
    const renderer = new PixiRenderer();

    const snapshot: WorldSnapshot = {
      tick: 1,
      timeMs: 50,
      entities: [
        {
          id: 42,
          kind: "player" as const,
          x: 10,
          y: 10,
          vx: 0,
          vy: 0,
          rotation: 0,
          radius: 10,
        },
      ],
      events: [],
    };

    state.pushSnapshot(snapshot);

    const entityMap = new Map();
    entityMap.set(42, snapshot.entities[0]);
    renderer.sync(entityMap);

    expect(state.getLatest()?.tick).toBe(1);
    expect(renderer.getDebugEntities().length).toBe(1);
  });
});

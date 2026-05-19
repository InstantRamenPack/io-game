import { beforeAll, describe, expect, test } from "bun:test";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnWall,
} from "@tests/helpers/worldFixtures.ts";

function stepAndSnapshot(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  playerId: number,
  interestRadius: number,
): WorldSnapshot {
  runtime.world.step();
  runtime.snapshotManager.prepareTick(runtime.world, []);
  return runtime.snapshotManager.makeSnapshotForPlayer(
    runtime.world,
    playerId,
    interestRadius,
  );
}

describe("snapshot manager delta/full behavior", () => {
  beforeAll(bootstrapTestRegistries);

  test("early ticks are full snapshots", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);
    const first = stepAndSnapshot(runtime, playerId, 200);
    const second = stepAndSnapshot(runtime, playerId, 200);
    expect(first.full).toBe(true);
    expect(second.full).toBe(true);
  });

  test("static map metadata is only included in full snapshots", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);
    const first = stepAndSnapshot(runtime, playerId, 200);
    for (let i = 0; i < 5; i += 1) {
      stepAndSnapshot(runtime, playerId, 200);
    }

    const delta = stepAndSnapshot(runtime, playerId, 200);
    expect(first.full).toBe(true);
    expect(first.map).toBeDefined();
    expect(delta.full).toBe(false);
    expect(delta.map).toBeUndefined();
  });

  test("late joining players receive map metadata in their first snapshot", () => {
    const { runtime } = makeRuntime();
    const { playerId: firstPlayerId } = connectTestClient(runtime, "client-1");
    for (let i = 0; i < 8; i += 1) {
      stepAndSnapshot(runtime, firstPlayerId, 200);
    }

    const { playerId: latePlayerId } = connectTestClient(runtime, "client-2");
    const firstLateSnapshot = stepAndSnapshot(runtime, latePlayerId, 200);

    expect(firstLateSnapshot.full).toBe(true);
    expect(firstLateSnapshot.map).toBeDefined();
  });

  test("changed entity emits delta and strips stable fields", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    for (let i = 0; i < 5; i += 1) {
      stepAndSnapshot(runtime, playerId, 200);
    }

    wall.x += 12;
    runtime.world.markSpatialDirty();
    const delta = stepAndSnapshot(runtime, playerId, 200);
    expect(delta.full).toBe(false);
    const wallDelta = delta.entities.find((entity) => entity.id === wall.id);
    expect(wallDelta).toBeDefined();
    expect(wallDelta?.hitboxes).toBeUndefined();
    expect(wallDelta?.typeId).toBeUndefined();
    expect(wallDelta?.hp).toBeUndefined();
    expect(wallDelta?.maxHp).toBeUndefined();
    expect(wallDelta?.alive).toBeUndefined();
    expect(wallDelta?.ownerId).toBeUndefined();
  });

  test("unchanged entities are omitted from delta snapshots", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    for (let i = 0; i < 6; i += 1) {
      stepAndSnapshot(runtime, playerId, 200);
    }

    const snapshot = stepAndSnapshot(runtime, playerId, 200);
    expect(snapshot.full).toBe(false);
    expect(snapshot.entities.some((entity) => entity.id === wall.id)).toBe(
      false,
    );
  });

  test("hitbox changes force a full entity snapshot", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    for (let i = 0; i < 5; i += 1) {
      stepAndSnapshot(runtime, playerId, 200);
    }

    wall.setHitboxProfileRects("default", [
      { width: 10, height: 10, offsetX: 0, offsetY: 0 },
    ]);
    const snapshot = stepAndSnapshot(runtime, playerId, 200);
    const entry = snapshot.entities.find((entity) => entity.id === wall.id);
    expect(entry).toBeDefined();
    expect(entry?.hitboxes).toBeDefined();
    expect(entry?.typeId).toBeDefined();
  });
});

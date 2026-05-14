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
  includeAllEntities = false,
): WorldSnapshot {
  runtime.world.step();
  runtime.snapshotManager.prepareTick(runtime.world, []);
  return runtime.snapshotManager.makeSnapshotForPlayer(
    runtime.world,
    playerId,
    interestRadius,
    undefined,
    includeAllEntities,
  );
}

function stepPastInitialFullSnapshots(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  playerId: number,
  interestRadius: number,
): void {
  while (runtime.world.tick <= 2) {
    stepAndSnapshot(runtime, playerId, interestRadius);
  }
}

describe("snapshot manager AOI", () => {
  beforeAll(bootstrapTestRegistries);

  test("local player included even if no other entities", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    expect(snapshot.entities.some((entity) => entity.id === playerId)).toBe(
      true,
    );
  });

  test("entity inside interest radius is included", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    expect(snapshot.entities.some((entity) => entity.id === wall.id)).toBe(
      true,
    );
  });

  test("entity outside interest radius is excluded", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 1000, player.y);
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    expect(snapshot.entities.some((entity) => entity.id === wall.id)).toBe(
      false,
    );
  });

  test("debug player receives entities outside interest radius", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(
      runtime,
      "client-1",
      "debug",
    );
    const wall = spawnWall(runtime, player.x + 1000, player.y);
    const snapshot = stepAndSnapshot(
      runtime,
      playerId,
      120,
      player.isDebugSpectatorMode(),
    );
    expect(snapshot.entities.some((entity) => entity.id === wall.id)).toBe(
      true,
    );
  });

  test("entity crossing out of AOI is removed", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    stepPastInitialFullSnapshots(runtime, playerId, 120);
    wall.x = player.x + 1000;
    wall.y = player.y;
    runtime.world.markSpatialDirty();
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    expect(snapshot.removedEntityIds).toEqual([wall.id]);
  });

  test("entity crossing back into AOI sends a full snapshot", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    stepPastInitialFullSnapshots(runtime, playerId, 120);
    wall.x = player.x + 1000;
    runtime.world.markSpatialDirty();
    stepAndSnapshot(runtime, playerId, 120);
    wall.x = player.x + 30;
    runtime.world.markSpatialDirty();
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    const entity = snapshot.entities.find((entry) => entry.id === wall.id);
    expect(entity).toBeDefined();
    expect(entity?.hitboxes).toBeDefined();
  });

  test("despawned entities are reported as removed", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    stepPastInitialFullSnapshots(runtime, playerId, 120);
    runtime.world.despawn(wall.id);
    const snapshot = stepAndSnapshot(runtime, playerId, 120);
    expect(snapshot.removedEntityIds).toEqual([wall.id]);
  });

  test("interest radius of zero includes only the player", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    spawnWall(runtime, player.x + 100, player.y);
    const snapshot = stepAndSnapshot(runtime, playerId, 0);
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.id).toBe(playerId);
  });
});

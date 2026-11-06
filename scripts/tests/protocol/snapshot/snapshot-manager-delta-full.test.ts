import { beforeAll, describe, expect, test } from "bun:test";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Wall } from "@server/registry/generated/buildingCtors.ts";
import {
  encodeServerToClientMessage,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";
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

  test("snapshot inclusion markers are bounded after high-ID entity churn", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    for (let id = 70_000; id < 70_020; id++) {
      const wall = new Wall(id);
      wall.x = player.x + 100;
      wall.y = player.y;
      runtime.world.spawn(wall);
      stepAndSnapshot(runtime, playerId, 300);
      runtime.world.despawn(id);
    }
    stepAndSnapshot(runtime, playerId, 300);
    expect(
      (
        runtime.snapshotManager as unknown as {
          includedSparseEntityMarkers: Map<number, number>;
        }
      ).includedSparseEntityMarkers.size,
    ).toBe(0);
  });

  test("repeated full entity sends recover a dropped AOI spawn and periodic refresh repairs later loss", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const state = new ClientWorldState(8);
    const deliver = (snapshot: WorldSnapshot) => {
      const message = parseServerToClientMessage(
        encodeServerToClientMessage({ t: "snapshot", snapshot }),
      );
      if (message?.t !== "snapshot")
        throw new Error("Expected binary snapshot round-trip");
      state.pushSnapshot(message.snapshot, message.snapshot.tick * 200);
    };
    for (let i = 0; i < 8; i++)
      deliver(stepAndSnapshot(runtime, playerId, 300));
    const wall = spawnWall(runtime, player.x + 100, player.y);
    // Lose the first three complete spawn records at 5 TPS.
    for (let i = 0; i < 3; i++) stepAndSnapshot(runtime, playerId, 300);
    expect(state.clientWorld!.entities.has(wall.id)).toBe(false);
    deliver(stepAndSnapshot(runtime, playerId, 300));
    expect(state.clientWorld!.entities.get(wall.id)?.hp).toBe(wall.hp);
    wall.hp -= 1;
    stepAndSnapshot(runtime, playerId, 300); // Lose a state change as well.
    const missingHp = state.clientWorld!.entities.get(wall.id)!.hp;
    expect(missingHp).not.toBe(wall.hp);
    runtime.world.tick += 600;
    runtime.snapshotManager.prepareTick(runtime.world, []);
    deliver(
      runtime.snapshotManager.makeSnapshotForPlayer(
        runtime.world,
        playerId,
        300,
      ),
    );
    expect(state.clientWorld!.entities.get(wall.id)?.hp).toBe(wall.hp);
  });

  test("preview observers share one immutable encoded snapshot per tick", () => {
    const { runtime, network } = makeRuntime();
    runtime.connectPreviewClient("preview-a");
    runtime.connectPreviewClient("preview-b");
    runtime.tick();
    expect(network.sent).toHaveLength(2);
    expect(network.sent[0]!.data).toBe(network.sent[1]!.data);
    const firstBytes = network.sent[0]!.data;
    runtime.tick();
    expect(network.sent[2]!.data).not.toBe(firstBytes);
    expect(network.sent[2]!.data).toBe(network.sent[3]!.data);
  });

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

  test("full map snapshots include village marker risk and tier", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);
    const snapshot = stepAndSnapshot(runtime, playerId, 200);
    const map = snapshot.map;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("expected full snapshot to include static map metadata");
    }

    const riskTier = {
      low: "common",
      medium: "uncommon",
      high: "rare",
      boss: "epic",
    } as const;
    const villageFeatures = map.features.filter(
      (feature) => feature.role === "village",
    );
    expect(villageFeatures.length).toBeGreaterThan(0);
    for (const feature of villageFeatures) {
      const marker = map.markers.find(
        (candidate) => candidate.id === feature.id,
      );
      expect(marker).toBeDefined();
      expect(marker?.risk).toBe(feature.risk);
      expect(marker?.tier).toBe(riskTier[feature.risk]);
    }
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

  test("movement below wire precision does not emit a redundant delta", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const wall = spawnWall(runtime, player.x + 40, player.y);
    for (let i = 0; i < 6; i += 1) {
      stepAndSnapshot(runtime, playerId, 200);
    }

    wall.x = Math.round(wall.x * 10) / 10 + 0.01;
    runtime.world.markSpatialDirty();
    const snapshot = stepAndSnapshot(runtime, playerId, 200);
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

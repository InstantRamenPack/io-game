import { beforeAll, describe, expect, test } from "bun:test";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnWall,
  tick,
} from "../helpers/worldFixtures.ts";

const wallItemId = makeResourceId("item", "wall");
const fenceItemId = makeResourceId("item", "structure_fence_h");
const STRUCTURE_TILE_SIZE = 16;

function enqueueAction(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  action: ActionMessage,
): void {
  runtime.handleAction("client-1", action);
  tick(runtime, 1);
}

function getNewEntities(before: Set<number>, after: Entity[]): Entity[] {
  return after.filter((entity) => !before.has(entity.id));
}

describe("build placement authority", () => {
  beforeAll(bootstrapTestRegistries);

  test("build within range spawns structure", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 1);
    const beforeIds = new Set(runtime.world.entities.all().map((e) => e.id));
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 40, y: player.y },
    });
    const spawned = getNewEntities(beforeIds, runtime.world.entities.all());
    expect(spawned.length).toBeGreaterThan(0);
  });

  test("build out of range does not spawn", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 1);
    const beforeCount = runtime.world.entities.all().length;
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: {
        x: player.x + BUILD_PLACEMENT_MAX_DISTANCE + 200,
        y: player.y,
      },
    });
    expect(runtime.world.entities.all().length).toBe(beforeCount);
  });

  test("build overlapping player is rejected", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 1);
    const beforeCount = runtime.world.entities.all().length;
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x, y: player.y },
    });
    expect(runtime.world.entities.all().length).toBe(beforeCount);
  });

  test("build overlapping static blocker is rejected", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const blocker = spawnWall(runtime, player.x + 40, player.y);
    player.inventory.addStackable(wallItemId, 1);
    const beforeCount = runtime.world.entities.all().length;
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: blocker.x, y: blocker.y },
    });
    expect(runtime.world.entities.all().length).toBe(beforeCount);
  });

  test("build outside world bounds is rejected", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 1);
    const beforeCount = runtime.world.entities.all().length;
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: -10, y: -10 },
    });
    expect(runtime.world.entities.all().length).toBe(beforeCount);
  });

  test("missing inventory prevents build", () => {
    const { runtime } = makeRuntime();
    connectTestClient(runtime);
    const beforeCount = runtime.world.entities.all().length;
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: 100, y: 100 },
    });
    expect(runtime.world.entities.all().length).toBe(beforeCount);
  });

  test("structure placement snaps to grid", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(fenceItemId, 1);
    const beforeIds = new Set(runtime.world.entities.all().map((e) => e.id));
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 33, y: player.y + 17 },
    });
    const spawned = getNewEntities(beforeIds, runtime.world.entities.all());
    expect(spawned.length).toBeGreaterThan(0);
    const structure = spawned[0]!;
    const expectedX =
      Math.floor((player.x + 33) / STRUCTURE_TILE_SIZE) *
        STRUCTURE_TILE_SIZE +
      STRUCTURE_TILE_SIZE / 2;
    const expectedY =
      Math.floor((player.y + 17) / STRUCTURE_TILE_SIZE) *
        STRUCTURE_TILE_SIZE +
      STRUCTURE_TILE_SIZE / 2;
    expect(structure.x).toBeCloseTo(expectedX, 3);
    expect(structure.y).toBeCloseTo(expectedY, 3);
  });

  test("duplicate build action does not spawn twice", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 2);
    const beforeCount = runtime.world.entities.all().length;
    const action: ActionMessage = {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 40, y: player.y },
    };
    runtime.handleAction("client-1", action);
    runtime.handleAction("client-1", action);
    tick(runtime, 1);
    expect(runtime.world.entities.all().length).toBe(beforeCount + 1);
  });
});

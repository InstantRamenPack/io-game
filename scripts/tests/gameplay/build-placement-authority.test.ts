import { beforeAll, describe, expect, test } from "bun:test";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnWall,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const wallItemId = makeResourceId("item", "wall");
const treeItemId = makeResourceId("item", "structure_tree");

function addAndSelectBuildable(
  player: ReturnType<typeof connectTestClient>["player"],
  typeId: ResourceId,
  count: number,
): void {
  player.inventory.addStackable(typeId, count);
  const slotIndex = player.inventory.hotbarSlots.findIndex(
    (slot) => slot?.kind === "buildable" && slot.typeId === typeId,
  );
  expect(slotIndex).toBeGreaterThanOrEqual(0);
  player.inventory.setSelectedHotbarIndex(slotIndex);
}

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
    addAndSelectBuildable(player, wallItemId, 1);
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
    addAndSelectBuildable(player, wallItemId, 1);
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
    addAndSelectBuildable(player, wallItemId, 1);
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
    addAndSelectBuildable(player, wallItemId, 1);
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
    addAndSelectBuildable(player, wallItemId, 1);
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

  test("structure placement snaps to pixel", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const homeBounds = runtime.world.proceduralLayout?.homeBounds;
    expect(homeBounds).toBeDefined();
    player.x = homeBounds!.minX + 512;
    player.y = homeBounds!.minY + 512;
    addAndSelectBuildable(player, treeItemId, 1);
    const beforeIds = new Set(runtime.world.entities.all().map((e) => e.id));
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 128, y: player.y },
    });
    const spawned = getNewEntities(beforeIds, runtime.world.entities.all());
    expect(spawned.length).toBeGreaterThan(0);
    const structure = spawned[0]!;
    expect(structure.x).toBe(Math.round(player.x + 128));
    expect(structure.y).toBe(Math.round(player.y));
  });

  test("player building placement snaps to pixel", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    addAndSelectBuildable(player, wallItemId, 1);
    const beforeIds = new Set(runtime.world.entities.all().map((e) => e.id));
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 47, y: player.y + 19 },
    });
    const spawned = getNewEntities(beforeIds, runtime.world.entities.all());
    expect(spawned.length).toBeGreaterThan(0);
    const building = spawned[0]!;
    expect(building.x).toBe(Math.round(player.x + 47));
    expect(building.y).toBe(Math.round(player.y + 19));
  });

  test("outer-sector player buildings lose health over time while center buildings persist", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }

    addAndSelectBuildable(player, wallItemId, 2);
    const beforeCenterIds = new Set(
      runtime.world.entities.all().map((e) => e.id),
    );
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "build",
      build: { x: player.x + 48, y: player.y },
    });
    const centerBuilding = getNewEntities(
      beforeCenterIds,
      runtime.world.entities.all(),
    )[0];
    expect(centerBuilding).toBeDefined();

    const hostileSector = layout.sectors.find(
      (sector) => sector.archetype !== "home" && sector.archetype !== "dungeon",
    )!;
    player.x = hostileSector.center.x;
    player.y = hostileSector.center.y;
    const beforeOuterIds = new Set(
      runtime.world.entities.all().map((e) => e.id),
    );
    enqueueAction(runtime, {
      t: "action",
      seq: 2,
      action: "build",
      build: { x: player.x + 48, y: player.y },
    });
    const outerBuilding = getNewEntities(
      beforeOuterIds,
      runtime.world.entities.all(),
    )[0];
    expect(outerBuilding).toBeDefined();

    tick(runtime, runtime.world.gameConfig.tickRate * 6);
    expect(runtime.world.entities.has(centerBuilding!.id)).toBe(true);
    expect(centerBuilding!.hp).toBe(centerBuilding!.maxHp);
    expect(runtime.world.entities.has(outerBuilding!.id)).toBe(true);
    expect(outerBuilding!.hp).toBeLessThan(outerBuilding!.maxHp);
    expect(outerBuilding!.hp).toBeGreaterThan(0);

    tick(runtime, runtime.world.gameConfig.tickRate * 15);
    expect(runtime.world.entities.has(centerBuilding!.id)).toBe(true);
    expect(runtime.world.entities.has(outerBuilding!.id)).toBe(false);
  }, 10_000);

  test("duplicate build action does not spawn twice", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    addAndSelectBuildable(player, wallItemId, 2);
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

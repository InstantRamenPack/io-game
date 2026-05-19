import { beforeAll, describe, expect, test } from "bun:test";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { toVisibilityBlocker } from "@client/net/presentation/PixiWorldPresentationSink.ts";
import { countVisibilityShadowPolygonsForBenchmark } from "@client/render/pixi/PixiLightsOutOverlay.ts";
import { computeLightsOutPresentation } from "@client/render/pixi/PixiWorldView.ts";
import {
  makeBuildingSnapshot,
  makeStructureSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnEnemy,
  spawnWall,
} from "@tests/helpers/worldFixtures.ts";

describe("lights-out visibility", () => {
  beforeAll(bootstrapTestRegistries);

  test("day lights-out is fully suppressed regardless of distance", () => {
    const worldSize = { w: 12_288, h: 12_288 };
    const center = { x: worldSize.w / 2, y: worldSize.h / 2 };

    for (const dist of [0, 1500, 1750, 2000, 4000]) {
      expect(
        computeLightsOutPresentation({
          player: { x: center.x + dist, y: center.y },
          worldSize,
          nightBlend: 0,
          energyActive: true,
        }).alpha,
      ).toBe(0);
    }
  });

  test("server snapshots keep lights-out replication authoritative-agnostic", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    const outer = layout.sectors.find((sector) => sector.archetype !== "home")!;
    player.x = outer.minX + 768;
    player.y = outer.minY + 768;
    const wall = spawnWall(runtime, player.x + 112, player.y);
    const hiddenEnemy = spawnEnemy(
      runtime,
      "drifter",
      player.x + 240,
      player.y,
    );
    const visibleEnemy = spawnEnemy(
      runtime,
      "drifter",
      player.x,
      player.y + 240,
    );

    runtime.world.ensureSpatialIndex();
    runtime.snapshotManager.prepareTick(runtime.world, []);
    const snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    const ids = new Set(snapshot.entities.map((entity) => entity.id));
    expect(snapshot.visibility).toBeUndefined();
    expect(ids.has(player.id)).toBe(true);
    expect(ids.has(wall.id)).toBe(true);
    expect(ids.has(visibleEnemy.id)).toBe(true);
    expect(ids.has(hiddenEnemy.id)).toBe(true);
  });

  test("multi-rect structure hitboxes stay grouped as one lights-out blocker", () => {
    const dungeon = new ClientEntity(
      makeStructureSnapshot(90, 1000, 2000, {
        typeId: "structure:dungeon",
        hitboxes: [
          { width: 100, height: 20, offsetX: -50, offsetY: 0 },
          { width: 30, height: 120, offsetX: 80, offsetY: 40 },
          { width: 40, height: 40, offsetX: 0, offsetY: -90 },
        ],
      }),
      1,
      4,
    );

    expect(toVisibilityBlocker(dungeon)).toEqual({
      kind: "rects",
      sourceEntityId: 90,
      rects: [
        {
          minX: 900,
          minY: 1990,
          maxX: 1000,
          maxY: 2010,
        },
        {
          minX: 1065,
          minY: 1980,
          maxX: 1095,
          maxY: 2100,
        },
        {
          minX: 980,
          minY: 1890,
          maxX: 1020,
          maxY: 1930,
        },
      ],
    });
  });

  test("tripwire trigger hitboxes do not become lights-out blockers", () => {
    const tripwire = new ClientEntity(
      makeBuildingSnapshot(91, 1000, 2000, {
        typeId: "building:tripwire",
        hitboxes: [{ width: 220, height: 16, offsetX: 0, offsetY: 0 }],
        hp: 0,
        maxHp: 0,
        label: "Tripwire",
      }),
      1,
      4,
    );

    expect(toVisibilityBlocker(tripwire)).toBeNull();
  });

  test("lights-out shadow projection includes blockers beyond visibility radius", () => {
    const visibility = {
      restricted: true,
      center: { x: 0, y: 0 },
      radius: 500,
    };
    const blockers = [
      {
        kind: "rects" as const,
        sourceEntityId: 1,
        rects: [{ minX: 2000, minY: -50, maxX: 2100, maxY: 50 }],
      },
      {
        kind: "circle" as const,
        sourceEntityId: 2,
        centerX: 0,
        centerY: 2200,
        radius: 40,
      },
    ];

    expect(
      countVisibilityShadowPolygonsForBenchmark(visibility, blockers),
    ).toBe(5);
  });

  test("night lights-out uses the tighter home radius", () => {
    const worldSize = { w: 12_288, h: 12_288 };
    const center = { x: worldSize.w / 2, y: worldSize.h / 2 };

    expect(
      computeLightsOutPresentation({
        player: { x: center.x + 500, y: center.y },
        worldSize,
        nightBlend: 1,
        energyActive: true,
      }).alpha,
    ).toBe(0);
    expect(
      computeLightsOutPresentation({
        player: { x: center.x + 937.5, y: center.y },
        worldSize,
        nightBlend: 1,
        energyActive: true,
      }).alpha,
    ).toBeCloseTo(0.5);
    expect(
      computeLightsOutPresentation({
        player: { x: center.x + 1125, y: center.y },
        worldSize,
        nightBlend: 1,
        energyActive: true,
      }).alpha,
    ).toBe(1);
  });

  test("transition blends activation radius smoothly between day and night", () => {
    const worldSize = { w: 12_288, h: 12_288 };
    const center = { x: worldSize.w / 2, y: worldSize.h / 2 };

    // At nightBlend=0.5, fadeStart=1125, fadeEnd=1562.5. A player at +1343.75 is
    // midway through the fade (rawAlpha=0.5), then scaled by nightBlend (0.5) → 0.25.
    expect(
      computeLightsOutPresentation({
        player: { x: center.x + 1343.75, y: center.y },
        worldSize,
        nightBlend: 0.5,
        energyActive: true,
      }).alpha,
    ).toBeCloseTo(0.25);
  });

  test("energy failure forces full lights-out anywhere during night", () => {
    const worldSize = { w: 12_288, h: 12_288 };
    const center = { x: worldSize.w / 2, y: worldSize.h / 2 };
    const presentation = computeLightsOutPresentation({
      player: center,
      worldSize,
      nightBlend: 1,
      energyActive: false,
    });

    expect(presentation.alpha).toBe(1);
    expect(presentation.visibility?.restricted).toBe(true);
    expect(presentation.visibility?.radius).toBe(500);
  });

  test("map center override drives live activation distance", () => {
    const worldSize = { w: 12_288, h: 12_288 };
    const center = { x: 4096, y: 4096 };

    expect(
      computeLightsOutPresentation({
        player: { x: center.x + 2000, y: center.y },
        center,
        worldSize,
        nightBlend: 1,
        energyActive: true,
      }).alpha,
    ).toBe(1);
  });
});

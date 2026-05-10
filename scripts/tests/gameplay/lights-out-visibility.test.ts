import { beforeAll, describe, expect, test } from "bun:test";
import {
  OUTER_LIGHTS_OUT_RADIUS,
  getVisibilityContext,
  getVisibilityContextForMap,
  isPointVisible,
} from "@shared/world/Visibility.ts";
import { generateProceduralWorldLayout } from "@shared/world/ProceduralWorld.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnEnemy,
  spawnWall,
} from "@tests/helpers/worldFixtures.ts";

describe("lights-out visibility", () => {
  beforeAll(bootstrapTestRegistries);

  test("outer sectors restrict radius and center sector is broadly visible", () => {
    const layout = generateProceduralWorldLayout(1337);
    const home = layout.sectors.find((sector) => sector.archetype === "home")!;
    const outer = layout.sectors.find((sector) => sector.archetype !== "home")!;

    const homeContext = getVisibilityContext(layout, home.center);
    expect(homeContext.restricted).toBe(false);
    expect(isPointVisible(homeContext, { x: 0, y: 0 }, [])).toBe(true);

    const outerContext = getVisibilityContext(layout, outer.center);
    expect(outerContext.restricted).toBe(true);
    expect(outerContext.radius).toBe(OUTER_LIGHTS_OUT_RADIUS);
    expect(
      isPointVisible(
        outerContext,
        { x: outer.center.x + OUTER_LIGHTS_OUT_RADIUS + 16, y: outer.center.y },
        [],
      ),
    ).toBe(false);
  });

  test("outer visibility respects line of sight blockers and open corridors", () => {
    const layout = generateProceduralWorldLayout(1337);
    const outer = layout.sectors.find((sector) => sector.archetype !== "home")!;
    const context = getVisibilityContext(layout, outer.center);
    const blocker = {
      minX: outer.center.x + 96,
      minY: outer.center.y - 64,
      maxX: outer.center.x + 128,
      maxY: outer.center.y + 64,
      centerX: outer.center.x + 112,
      centerY: outer.center.y,
      offsetX: 0,
      offsetY: 0,
      width: 32,
      height: 128,
    };

    expect(
      isPointVisible(context, { x: outer.center.x + 220, y: outer.center.y }, [
        blocker,
      ]),
    ).toBe(false);
    expect(
      isPointVisible(
        context,
        { x: outer.center.x + 220, y: outer.center.y + 160 },
        [blocker],
      ),
    ).toBe(true);
  });

  test("outer visibility keeps the casting blocker visible but hides blockers behind it", () => {
    const layout = generateProceduralWorldLayout(1337);
    const outer = layout.sectors.find((sector) => sector.archetype !== "home")!;
    const context = getVisibilityContext(layout, outer.center);
    const nearWall = {
      sourceEntityId: 101,
      minX: outer.center.x + 96,
      minY: outer.center.y - 64,
      maxX: outer.center.x + 128,
      maxY: outer.center.y + 64,
    };
    const farWall = {
      sourceEntityId: 202,
      minX: outer.center.x + 220,
      minY: outer.center.y - 64,
      maxX: outer.center.x + 252,
      maxY: outer.center.y + 64,
    };

    expect(
      isPointVisible(
        context,
        { x: outer.center.x + 112, y: outer.center.y },
        [nearWall, farWall],
        {
          targetSourceEntityId: nearWall.sourceEntityId,
        },
      ),
    ).toBe(true);
    expect(
      isPointVisible(
        context,
        { x: outer.center.x + 236, y: outer.center.y },
        [nearWall, farWall],
        {
          targetSourceEntityId: farWall.sourceEntityId,
        },
      ),
    ).toBe(false);
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

  test("client-side map visibility hides blocked outer-sector entities", () => {
    const layout = generateProceduralWorldLayout(1337);
    const outer = layout.sectors.find((sector) => sector.archetype !== "home")!;
    const map = {
      sectors: layout.sectors.map((sector) => ({
        archetype: sector.archetype,
        minX: sector.minX,
        minY: sector.minY,
        maxX: sector.maxX,
        maxY: sector.maxY,
        hasLightsOut: sector.hasLightsOut,
      })),
    };
    const context = getVisibilityContextForMap(map, outer.center);
    const blocker = {
      minX: outer.center.x + 96,
      minY: outer.center.y - 64,
      maxX: outer.center.x + 128,
      maxY: outer.center.y + 64,
    };

    expect(context.restricted).toBe(true);
    expect(
      isPointVisible(context, { x: outer.center.x + 220, y: outer.center.y }, [
        blocker,
      ]),
    ).toBe(false);
    expect(
      isPointVisible(
        context,
        { x: outer.center.x + 220, y: outer.center.y + 160 },
        [blocker],
      ),
    ).toBe(true);
  });

  test("energy failure restricts client visibility even in home base", () => {
    const map = {
      sectors: [
        {
          archetype: "home",
          minX: 0,
          minY: 0,
          maxX: 100,
          maxY: 100,
          hasLightsOut: false,
        },
        {
          archetype: "forest",
          minX: 100,
          minY: 0,
          maxX: 200,
          maxY: 100,
          hasLightsOut: false,
        },
      ],
    };

    expect(
      getVisibilityContextForMap(
        map,
        { x: 50, y: 50 },
        {
          outdoorLightsActive: false,
        },
      ).restricted,
    ).toBe(true);
    expect(
      getVisibilityContextForMap(
        map,
        { x: 50, y: 50 },
        {
          outdoorLightsActive: false,
        },
      ).radius,
    ).toBe(OUTER_LIGHTS_OUT_RADIUS);
    const outerContext = getVisibilityContextForMap(
      map,
      { x: 150, y: 50 },
      {
        outdoorLightsActive: false,
      },
    );
    expect(outerContext.restricted).toBe(true);
    expect(outerContext.radius).toBe(OUTER_LIGHTS_OUT_RADIUS);
  });
});

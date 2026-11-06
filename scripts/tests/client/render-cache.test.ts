import { expect, spyOn, test } from "bun:test";
import type { Application } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { PixiWorldView } from "@client/render/pixi/PixiWorldView.ts";
import { PixiLightsOutOverlay } from "@client/render/pixi/PixiLightsOutOverlay.ts";
import type {
  LightsOutVisibilityContext,
  VisibilityBlockerShape,
} from "@client/render/renderTypes.ts";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { createGameSelectors } from "@client/app/gameSelectors.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { EntityRenderer } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import {
  makePlayerSnapshot,
  makeStructureSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";

test("membership and geometry caches ignore movement but track spawn, hitbox change and removal", () => {
  const state = new ClientWorldState(8);
  state.pushSnapshot(
    makeSnapshot(1, [
      makePlayerSnapshot(1, 0, 0),
      makeStructureSnapshot(2, 100, 0),
    ]),
    50,
  );
  const world = state.clientWorld!;
  const selectors = createGameSelectors({
    worldState: state,
    playerEntityId: 1,
  });
  const entities = selectors.getWorldEntities();
  const geometry = world.geometryVersion;
  const membership = world.membershipVersion;
  state.pushSnapshot(
    makeSnapshot(2, [makePlayerSnapshot(1, 20, 0)], { full: false }),
    250,
  );
  expect(world.geometryVersion).toBe(geometry);
  expect(world.membershipVersion).toBe(membership);
  expect(selectors.getWorldEntities()).toBe(entities);
  expect(world.entities.get(1)!.getServerFrameHistoryLength()).toBe(2);
  state.pushSnapshot(
    makeSnapshot(
      3,
      [
        makeStructureSnapshot(2, 100, 0, {
          hitboxes: [{ width: 64, height: 32, offsetX: 0, offsetY: 0 }],
        }),
      ],
      { full: false },
    ),
    450,
  );
  expect(world.geometryVersion).toBeGreaterThan(geometry);
  expect(selectors.getWorldEntities()).toBe(entities);
  state.pushSnapshot(
    { ...makeSnapshot(4, [], { full: false }), removedEntityIds: [2] },
    650,
  );
  expect(selectors.getWorldEntities()).not.toBe(entities);
  expect(selectors.getWorldEntities()).toHaveLength(1);
  state.pushSnapshot(
    makeSnapshot(5, [makeStructureSnapshot(3, 0, 0)], { full: false }),
    850,
  );
  expect(selectors.getWorldEntities()).toHaveLength(2);
});

test("unchanged scenery skips sync, but interpolated poses and transient animations never do", () => {
  const manager = new EntityRenderManager({} as PixiRenderer);
  let calls = 0;
  let animated = false;
  const stub = {
    sync() {
      calls++;
    },
    update() {},
    destroy() {},
    hasTransientAnimation() {
      return animated;
    },
    triggerDamageFlash() {
      animated = true;
    },
  } as unknown as EntityRenderer;
  const internals = manager as unknown as {
    renderers: Map<number, EntityRenderer>;
  };
  const structure = new ClientEntity(makeStructureSnapshot(1, 0, 0), 1, 8);
  const player = new ClientEntity(makePlayerSnapshot(2, 0, 0), 1, 8);
  internals.renderers.set(1, stub);
  manager.syncEntity(structure);
  for (let i = 0; i < 60; i++) manager.update(1000 / 60);
  expect(calls).toBe(1);
  // Static authoritative poses can still interpolate after corrections.
  structure.x += 1;
  manager.update(16);
  expect(calls).toBe(2);
  manager.triggerDamageFlash(1);
  manager.update(16);
  expect(calls).toBe(3);
  animated = false;
  manager.update(16);
  internals.renderers.set(2, stub);
  manager.syncEntity(player);
  const before = calls;
  for (let i = 0; i < 60; i++) {
    player.x += 0.2;
    manager.update(1000 / 60);
  }
  expect(calls - before).toBe(60);
  manager.destroy();
});

class TestRenderer extends BaseEntityRenderer {
  protected drawEntityShape(graphics: Graphics): void {
    graphics.clear().rect(0, 0, 10, 10).fill(0xffffff);
  }
  protected getFillColor(): number {
    return 0xffffff;
  }
}

test("scenery allocates neither equipment nor invisible health bars", () => {
  const container = new Container();
  const renderer = new TestRenderer({
    entityContainer: container,
  } as PixiRenderer);
  renderer.sync(new ClientEntity(makeStructureSnapshot(1, 0, 0), 1, 8));
  const internals = renderer as unknown as {
    equippedItemContainer?: Container;
    healthBarContainer?: Container;
  };
  expect(internals.equippedItemContainer).toBeUndefined();
  expect(internals.healthBarContainer).toBeUndefined();
  renderer.setVisibilityAlpha(0.4);
  renderer.destroy();
  const playerRenderer = new TestRenderer({
    entityContainer: container,
  } as PixiRenderer);
  playerRenderer.sync(new ClientEntity(makePlayerSnapshot(2, 0, 0), 1, 8));
  expect(
    (playerRenderer as unknown as { healthBarContainer?: Container })
      .healthBarContainer,
  ).toBeDefined();
  playerRenderer.destroy();
  expect(container.children).toHaveLength(0);
});

test("minimap background caches stable frames and invalidates on resize or comms changes", () => {
  const background = new Graphics();
  const clear = spyOn(background, "clear");
  const draw = Object.assign(Object.create(PixiWorldView.prototype), {
    minimapBackground: background,
    minimapBackgroundDirty: true,
    minimapWidth: -1,
    minimapHeight: -1,
    minimapLabel: { text: "", x: 0, y: 0 },
    mapState: { sectors: [], markers: [] },
    worldSize: { w: 12800, h: 12800 },
    infrastructureState: { commsActive: true, energyActive: true },
  }) as {
    minimapLabel: { text: string };
    redrawMinimapBackground(app: Application): void;
    updateInfrastructureState: PixiWorldView["updateInfrastructureState"];
  };
  const app = { screen: { width: 800, height: 600 } } as Application;
  draw.redrawMinimapBackground(app);
  draw.redrawMinimapBackground(app);
  expect(clear).toHaveBeenCalledTimes(1);
  app.screen.width = 1000;
  draw.redrawMinimapBackground(app);
  expect(clear).toHaveBeenCalledTimes(2);
  draw.updateInfrastructureState({ commsActive: false, energyActive: true });
  draw.redrawMinimapBackground(app);
  expect(clear).toHaveBeenCalledTimes(3);
  expect(draw.minimapLabel.text).toBe("COMMS OFFLINE");
  clear.mockRestore();
  background.destroy();
});

test("shadow cache invalidates for light movement, blockers, screen size and resolution", () => {
  let rebuilds = 0;
  const overlay = Object.assign(Object.create(PixiLightsOutOverlay.prototype), {
    lastShadowBlockers: null,
    lastShadowInputs: [],
    blockerLayers: [],
    blockerShadows: { visible: false },
    blockerBatchRoot: {},
    ensureAccumRenderTexture() {
      rebuilds++;
      return {};
    },
  }) as {
    updateBlockerShadowTexture(
      app: Application,
      visibility: LightsOutVisibilityContext,
      blockers: readonly VisibilityBlockerShape[],
      transform: object,
    ): void;
  };
  const app = {
    screen: { width: 800, height: 600 },
    renderer: { resolution: 1 },
  } as Application;
  const visibility = {
    restricted: true,
    center: { x: 100, y: 100 },
    radius: 500,
  };
  const blockers: VisibilityBlockerShape[] = [];
  const transform = {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    radius: 500,
  };
  const draw = (next = blockers) =>
    overlay.updateBlockerShadowTexture(app, visibility, next, transform);
  draw();
  draw();
  expect(rebuilds).toBe(1);
  visibility.center.x++;
  draw();
  expect(rebuilds).toBe(2);
  transform.offsetX++;
  draw();
  expect(rebuilds).toBe(3);
  app.screen.width++;
  draw();
  expect(rebuilds).toBe(4);
  app.renderer.resolution = 2;
  draw();
  expect(rebuilds).toBe(5);
  draw([]);
  expect(rebuilds).toBe(6);
});

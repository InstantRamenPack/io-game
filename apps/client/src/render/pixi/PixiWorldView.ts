import {
  Graphics,
  Text,
  TextStyle,
  type Application,
  type Container,
} from "pixi.js";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { BaseVisionOverlay } from "@client/render/pixi/BaseVisionOverlay.ts";
import { HelipadOverlay } from "@client/render/pixi/HelipadOverlay.ts";
import {
  PixiPlacementPreview,
  type PlacementPreviewState,
} from "@client/render/pixi/PixiPlacementPreview.ts";
import { PixiSceneGraph } from "@client/render/pixi/PixiSceneGraph.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import { PixiCullingController } from "@client/render/pixi/PixiCullingController.ts";
import { PixiLightsOutOverlay } from "@client/render/pixi/PixiLightsOutOverlay.ts";
import type {
  LightsOutVisibilityContext,
  VisibilityBlockerShape,
  WorldSize,
} from "@client/render/renderTypes.ts";
import type {
  ExtractionSnapshot,
  InfrastructureSnapshot,
  MapSnapshot,
} from "@shared/net/snapshots.ts";

const GRID_CELL_SIZE = 100;
const HOME_BASE_WIDTH = 1600;
const HOME_BASE_HEIGHT = 1200;
const GRID_DAY_FILL_COLOR = 0xd7f3d2;
const GRID_NIGHT_FILL_COLOR = 0x3f5f46;
const GRID_DAY_LINE_COLOR = 0x2d4f37;
const GRID_NIGHT_LINE_COLOR = 0x9fd69a;
const GRID_LOBBY_FILL_COLOR = 0xf2e8d0;
const GRID_LOBBY_LINE_COLOR = 0x9e8060;
const SNIPER_AIM_LINE_COLOR = 0xff2d2d;
const SNIPER_AIM_LINE_ALPHA = 0.35;
const SNIPER_AIM_LINE_WIDTH = 2;
const MINIMAP_SIZE = 184;
const MINIMAP_PADDING = 16;
// Use a game-scale epsilon to avoid precision issues with large world coords.
const MIN_DISTANCE_EPSILON = 1e-6;
const DAY_LIGHTS_OUT_FADE_START_RADIUS = 1500;
const DAY_LIGHTS_OUT_FADE_END_RADIUS = 2000;
const NIGHT_LIGHTS_OUT_FADE_START_RADIUS = 750;
const NIGHT_LIGHTS_OUT_FADE_END_RADIUS = 1125;
const FULL_LIGHTS_OUT_RADIUS = 500;
const DISTANT_LIGHTS_OUT_RADIUS = 1000;
const DUNGEON_LIGHTS_OUT_FADE_DISTANCE = 100;

type MinimapPlayerMarker = {
  x: number;
  y: number;
  isSelf: boolean;
};

export function computeLightsOutPresentation(options: {
  player: { x: number; y: number } | null;
  worldSize: WorldSize;
  center?: { x: number; y: number } | null;
  dungeonBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  nightBlend: number;
  energyActive: boolean;
}): { visibility: LightsOutVisibilityContext | null; alpha: number } {
  const { player, worldSize, nightBlend, energyActive } = options;
  if (!player) {
    return { visibility: null, alpha: 0 };
  }
  const center = options.center ?? {
    x: worldSize.w / 2,
    y: worldSize.h / 2,
  };
  const fadeStartRadius = lerp(
    DAY_LIGHTS_OUT_FADE_START_RADIUS,
    NIGHT_LIGHTS_OUT_FADE_START_RADIUS,
    nightBlend,
  );
  const fadeEndRadius = lerp(
    DAY_LIGHTS_OUT_FADE_END_RADIUS,
    NIGHT_LIGHTS_OUT_FADE_END_RADIUS,
    nightBlend,
  );
  const distanceFromCenter = Math.hypot(
    player.x - center.x,
    player.y - center.y,
  );
  const rawAlpha = energyActive
    ? inverseLerp(fadeStartRadius, fadeEndRadius, distanceFromCenter)
    : 1;
  const nightAlpha = rawAlpha * nightBlend;
  const dungeonAlpha = computeDungeonLightsOutAlpha(
    player,
    options.dungeonBounds,
  );
  const alpha = Math.max(nightAlpha, dungeonAlpha);
  return {
    alpha,
    visibility: {
      center: player,
      radius: lerp(DISTANT_LIGHTS_OUT_RADIUS, FULL_LIGHTS_OUT_RADIUS, alpha),
      restricted: alpha > 0,
    },
  };
}

function computeDungeonLightsOutAlpha(
  player: { x: number; y: number },
  dungeonBounds:
    | { minX: number; minY: number; maxX: number; maxY: number }
    | null
    | undefined,
): number {
  if (!dungeonBounds || !pointInRectInclusive(player, dungeonBounds)) {
    return 0;
  }
  const distanceFromBoundary = Math.min(
    player.x - dungeonBounds.minX,
    dungeonBounds.maxX - player.x,
    player.y - dungeonBounds.minY,
    dungeonBounds.maxY - player.y,
  );
  return inverseLerp(0, DUNGEON_LIGHTS_OUT_FADE_DISTANCE, distanceFromBoundary);
}

function pointInRectInclusive(
  point: { x: number; y: number },
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

export class PixiWorldView {
  private readonly sceneGraph = new PixiSceneGraph();
  private readonly viewportController: PixiViewportController;
  private readonly cullingController = new PixiCullingController();
  private readonly placementPreview = new PixiPlacementPreview();
  private readonly sniperAimGuide = new Graphics();
  private readonly helipadOverlay = new HelipadOverlay();
  private readonly baseVisionOverlay = new BaseVisionOverlay();
  private readonly lightsOutOverlay = new PixiLightsOutOverlay();
  private readonly minimapGraphic = new Graphics();
  private readonly minimapLabel = new Text(
    "",
    new TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 10,
      fill: 0xe8f5e7,
    }),
  );
  private minimapPlayers: readonly MinimapPlayerMarker[] = [];
  private pendingExtractionState: ExtractionSnapshot | null = null;
  private infrastructureState: InfrastructureSnapshot = {
    energyActive: true,
    commsActive: true,
  };
  private mapState: MapSnapshot | null = null;
  private lastMapSeed: number | null = null;
  private visibilityState: LightsOutVisibilityContext | null = null;
  private localPlayerPosition: { x: number; y: number } | null = null;
  private visibilityBlockers: VisibilityBlockerShape[] = [];
  private worldSize: WorldSize;
  private gridNightBlend = 0;
  private lightsOutNightBlend = 0;
  private lightsOutSuppressed = false;
  private isPlayground = true;
  private lastGridCameraX = Number.NaN;
  private lastGridCameraY = Number.NaN;
  private lastGridScale = Number.NaN;
  private lastGridScreenWidth = -1;
  private lastGridScreenHeight = -1;

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.viewportController = new PixiViewportController(worldSize);
    this.baseVisionOverlay.setWorldSize(worldSize.w, worldSize.h);
    this.sniperAimGuide.visible = false;
    this.sceneGraph.placementLayer.addChild(this.sniperAimGuide);
    this.sceneGraph.entityLayer.addChild(this.helipadOverlay.container);
    this.sceneGraph.entityLayer.addChild(this.baseVisionOverlay.container);
    this.sceneGraph.overlayLayer.addChild(this.lightsOutOverlay.container);
    this.sceneGraph.hudLayer.addChild(this.minimapGraphic, this.minimapLabel);
  }

  public get entityContainer(): Container {
    return this.sceneGraph.entityLayer;
  }

  public get hudContainer(): Container {
    return this.sceneGraph.hudLayer;
  }

  public get effectContainer(): Container {
    return this.sceneGraph.effectLayer;
  }

  public get overlayContainer(): Container {
    return this.sceneGraph.overlayLayer;
  }

  public get worldRoot(): Container {
    return this.sceneGraph.worldRoot;
  }

  public attach(app: Application): void {
    this.sceneGraph.attach(app);
    this.placementPreview.attach(this.sceneGraph.placementLayer);
    this.cullingController.configure({
      worldRoot: this.sceneGraph.worldRoot,
      entityLayer: this.sceneGraph.entityLayer,
      effectLayer: this.sceneGraph.effectLayer,
      placementLayer: this.sceneGraph.placementLayer,
      hudRoot: this.sceneGraph.hudRoot,
      worldSize: this.worldSize,
    });
    this.drawGridGeometry();
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.viewportController.setWorldSize(this.worldSize);
    this.cullingController.updateWorldSize(this.worldSize);
    this.baseVisionOverlay.setWorldSize(worldSize.w, worldSize.h);
    this.invalidateGridLineCache();
    this.drawGridGeometry();
  }

  private invalidateGridLineCache(): void {
    this.lastGridCameraX = Number.NaN;
    this.lastGridCameraY = Number.NaN;
    this.lastGridScale = Number.NaN;
    this.lastGridScreenWidth = -1;
    this.lastGridScreenHeight = -1;
  }

  public update(
    deltaMs: number,
    app: Application,
    swimOffset: { x: number; y: number },
  ): void {
    this.viewportController.setSwimOffset(swimOffset.x, swimOffset.y);
    this.viewportController.update(deltaMs, app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
    this.redrawScreenGridLinesIfNeeded(app);
    this.lightsOutOverlay.update(
      app,
      this.visibilityState,
      this.visibilityBlockers,
      (targetApp, worldX, worldY) =>
        this.worldToScreen(targetApp, worldX, worldY),
      this.getLightsOutOverlayAlpha(),
    );
    this.redrawMinimap(app);
    this.helipadOverlay.update(this.pendingExtractionState, deltaMs);
    this.baseVisionOverlay.update(deltaMs);
  }

  public updateExtractionState(state: ExtractionSnapshot | null): void {
    this.pendingExtractionState = state;
  }

  public updateInfrastructureState(state: InfrastructureSnapshot | null): void {
    this.infrastructureState = state ?? {
      energyActive: true,
      commsActive: true,
    };
    this.baseVisionOverlay.setEnergyActive(
      this.infrastructureState.energyActive,
    );
    this.recomputeVisibilityState();
  }

  public updateMapState(map: MapSnapshot | null): void {
    const seed = map?.seed ?? null;
    if (seed === this.lastMapSeed) {
      this.mapState = map;
      this.recomputeVisibilityState();
      return;
    }
    this.lastMapSeed = seed;
    this.mapState = map;
    this.recomputeVisibilityState();
    this.drawGridGeometry();
  }

  public updatePlayerVisibility(player: { x: number; y: number } | null): void {
    this.localPlayerPosition = player;
    this.recomputeVisibilityState();
  }

  public updateVisibilityBlockers(
    blockers: readonly VisibilityBlockerShape[],
  ): void {
    this.visibilityBlockers = blockers.slice();
  }

  public setMinimapPlayers(players: readonly MinimapPlayerMarker[]): void {
    this.minimapPlayers = players;
  }
  public setGridNightBlend(blend: number): void {
    this.gridNightBlend = Math.max(0, Math.min(1, blend));
    this.updateGridColors();
  }

  public setLightsOutNightBlend(blend: number): void {
    this.lightsOutNightBlend = Math.max(0, Math.min(1, blend));
    this.recomputeVisibilityState();
  }

  public setLightsOutSuppressed(suppressed: boolean): void {
    if (this.lightsOutSuppressed === suppressed) {
      return;
    }
    this.lightsOutSuppressed = suppressed;
    this.recomputeVisibilityState();
  }

  public setPlaygroundMode(isPlayground: boolean): void {
    if (this.isPlayground === isPlayground) {
      return;
    }
    this.isPlayground = isPlayground;
    this.updateGridColors();
    this.recomputeVisibilityState();
  }

  public setCameraToPlayer(
    app: Application | null,
    x: number,
    y: number,
  ): void {
    this.viewportController.setCameraTarget(x, y);
    if (!app) {
      return;
    }
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
  }

  public resetCamera(): void {
    this.viewportController.reset();
  }

  private recomputeVisibilityState(): void {
    if (this.lightsOutSuppressed || this.isPlayground) {
      this.visibilityState = null;
      return;
    }
    this.visibilityState = computeLightsOutPresentation({
      player: this.localPlayerPosition,
      worldSize: this.worldSize,
      center: this.getLightsOutCenter(),
      dungeonBounds: this.mapState?.dungeonBounds,
      nightBlend: this.lightsOutNightBlend,
      energyActive: this.infrastructureState.energyActive,
    }).visibility;
  }

  private getLightsOutOverlayAlpha(): number {
    if (this.lightsOutSuppressed || this.isPlayground) {
      return 0;
    }
    return computeLightsOutPresentation({
      player: this.localPlayerPosition,
      worldSize: this.worldSize,
      center: this.getLightsOutCenter(),
      dungeonBounds: this.mapState?.dungeonBounds,
      nightBlend: this.lightsOutNightBlend,
      energyActive: this.infrastructureState.energyActive,
    }).alpha;
  }

  private getLightsOutCenter(): { x: number; y: number } {
    const centerSector = this.mapState?.sectors.find(
      (sector) => sector.id === this.mapState?.centerSectorId,
    );
    if (centerSector) {
      return {
        x: (centerSector.minX + centerSector.maxX) / 2,
        y: (centerSector.minY + centerSector.maxY) / 2,
      };
    }
    return {
      x: this.worldSize.w / 2,
      y: this.worldSize.h / 2,
    };
  }

  public getCameraDebugState(
    app: Application | null,
  ): ReturnType<PixiViewportController["getCameraDebugState"]> {
    return this.viewportController.getCameraDebugState(app);
  }

  public screenToWorld(
    app: Application | null,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!app) {
      return { x: clientX, y: clientY };
    }
    return this.viewportController.screenToWorld(
      app,
      this.sceneGraph.worldRoot,
      clientX,
      clientY,
    );
  }

  public getViewportCenterWorld(
    app: Application | null,
  ): { x: number; y: number } | null {
    if (!app) {
      return null;
    }

    const centerClient = this.viewportController.getCanvasCenterClient(app);
    return this.viewportController.screenToWorld(
      app,
      this.sceneGraph.worldRoot,
      centerClient.x,
      centerClient.y,
    );
  }

  public clientToScreen(
    app: Application | null,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!app) {
      return { x: clientX, y: clientY };
    }
    return this.viewportController.clientToScreen(app, clientX, clientY);
  }

  public worldToScreen(
    app: Application | null,
    worldX: number,
    worldY: number,
  ): { x: number; y: number } | null {
    if (!app) {
      return null;
    }
    return this.viewportController.worldToScreen(
      app,
      this.sceneGraph.worldRoot,
      worldX,
      worldY,
    );
  }

  public invalidateViewRectCache(): void {
    this.viewportController.invalidateViewRectCache();
  }

  public setPlacementPreview(state: PlacementPreviewState | null): void {
    this.placementPreview.sync(state);
  }

  public setSniperAimGuide(
    state: {
      originX: number;
      originY: number;
      directionX: number;
      directionY: number;
    } | null,
  ): void {
    if (!state) {
      this.sniperAimGuide.clear();
      this.sniperAimGuide.visible = false;
      return;
    }

    const endpoint = clipRayToWorldBounds(
      state.originX,
      state.originY,
      state.directionX,
      state.directionY,
      this.worldSize,
    );
    if (!endpoint) {
      this.sniperAimGuide.clear();
      this.sniperAimGuide.visible = false;
      return;
    }

    this.sniperAimGuide.clear();
    this.sniperAimGuide
      .moveTo(state.originX, state.originY)
      .lineTo(endpoint.x, endpoint.y)
      .stroke({
        width: SNIPER_AIM_LINE_WIDTH,
        color: SNIPER_AIM_LINE_COLOR,
        alpha: SNIPER_AIM_LINE_ALPHA,
      });
    this.sniperAimGuide.visible = true;
  }

  private drawGridGeometry(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const landmarkGraphic = this.sceneGraph.landmarkGraphic;
    const { w, h } = this.worldSize;
    const baseWidth = Math.min(HOME_BASE_WIDTH, Math.max(800, w * 0.6));
    const baseHeight = Math.min(HOME_BASE_HEIGHT, Math.max(600, h * 0.5));
    const baseX = (w - baseWidth) / 2;
    const baseY = (h - baseHeight) / 2;
    const inset = Math.max(80, Math.min(baseWidth, baseHeight) * 0.08);
    const centerBandHeight = Math.max(160, baseHeight * 0.16);
    const centerBandY = baseY + (baseHeight - centerBandHeight) / 2;

    bgGraphic.clear();
    landmarkGraphic.clear();

    drawRect(bgGraphic, 0, 0, w, h, { color: 0xffffff, alpha: 1 });

    if (this.mapState) {
      this.drawProceduralMapArt(landmarkGraphic, this.mapState);
    } else {
      this.drawFallbackLandmarks(landmarkGraphic);
    }

    this.drawHomeCompound(
      landmarkGraphic,
      baseX,
      baseY,
      baseWidth,
      baseHeight,
      inset,
      centerBandY,
      centerBandHeight,
    );

    this.sceneGraph.updateGridCache();
    this.updateGridColors();
  }

  private drawProceduralMapArt(g: Graphics, map: MapSnapshot): void {
    for (const sector of map.sectors) {
      const width = sector.maxX - sector.minX;
      const height = sector.maxY - sector.minY;
      g.rect(sector.minX, sector.minY, width, height)
        .fill({ color: worldSectorColor(sector.archetype), alpha: 0.16 })
        .stroke({ width: 5, color: 0x1e2a2f, alpha: 0.16 });
    }

    for (const marker of map.markers) {
      if (!marker.discoveredByDefault && marker.importance !== "major") {
        continue;
      }
      if (marker.id === "extraction_helipad") {
        drawWorldHelipad(g, marker.x, marker.y, 150);
        continue;
      }
      const radius = marker.importance === "major" ? 78 : 42;
      g.circle(marker.x, marker.y, radius)
        .fill({ color: minimapMarkerColor(marker.archetype), alpha: 0.22 })
        .stroke({
          width: marker.importance === "major" ? 5 : 3,
          color: minimapMarkerColor(marker.archetype),
          alpha: 0.38,
        });
    }
  }

  private drawFallbackLandmarks(g: Graphics): void {
    g.rect(300, 300, 2400, 2400).fill({ color: 0x8b3a3a, alpha: 0.1 });
    g.rect(350, 3300, 1450, 1500).fill({ color: 0x3a5f8b, alpha: 0.13 });
    g.rect(3200, 250, 3300, 2250).fill({ color: 0x8b7a3a, alpha: 0.1 });
    g.rect(3200, 4800, 2900, 1900).fill({ color: 0x8b5a2a, alpha: 0.1 });
    g.rect(7000, 200, 2800, 6600).fill({ color: 0x2a5a2a, alpha: 0.13 });
    drawWorldHelipad(g, 1000, 4050, 130);
  }

  private drawHomeCompound(
    g: Graphics,
    baseX: number,
    baseY: number,
    baseWidth: number,
    baseHeight: number,
    inset: number,
    centerBandY: number,
    centerBandHeight: number,
  ): void {
    const innerX = baseX + inset;
    const innerY = baseY + inset;
    const innerW = baseWidth - inset * 2;
    const innerH = baseHeight - inset * 2;
    const cx = baseX + baseWidth / 2;
    const cy = baseY + baseHeight / 2;

    g.roundRect(baseX, baseY, baseWidth, baseHeight, 16)
      .fill({ color: 0x2a2f2d, alpha: 0.88 })
      .stroke({ width: 22, color: 0x111414, alpha: 0.78 });
    g.roundRect(innerX, innerY, innerW, innerH, 10)
      .fill({ color: 0x60695a, alpha: 0.58 })
      .stroke({ width: 8, color: 0xc5b58b, alpha: 0.36 });

    const tile = 96;
    for (let x = innerX + tile; x < innerX + innerW; x += tile) {
      g.moveTo(x, innerY)
        .lineTo(x, innerY + innerH)
        .stroke({ width: 2, color: 0x20251f, alpha: 0.2 });
    }
    for (let y = innerY + tile; y < innerY + innerH; y += tile) {
      g.moveTo(innerX, y)
        .lineTo(innerX + innerW, y)
        .stroke({ width: 2, color: 0x20251f, alpha: 0.2 });
    }

    g.rect(
      innerX + inset * 0.2,
      centerBandY,
      innerW - inset * 0.4,
      centerBandHeight,
    ).fill({ color: 0xc9bd91, alpha: 0.13 });
    g.moveTo(cx, innerY)
      .lineTo(cx, innerY + innerH)
      .moveTo(innerX, cy)
      .lineTo(innerX + innerW, cy)
      .stroke({ width: 34, color: 0xd3c18d, alpha: 0.12 });

    for (const [x, y] of [
      [innerX + 120, innerY + 120],
      [innerX + innerW - 120, innerY + 120],
      [innerX + 120, innerY + innerH - 120],
      [innerX + innerW - 120, innerY + innerH - 120],
    ] as const) {
      g.circle(x, y, 34)
        .fill({ color: 0xffa63d, alpha: 0.23 })
        .stroke({ width: 5, color: 0xffc264, alpha: 0.42 });
    }

    g.circle(cx, cy, Math.min(innerW, innerH) * 0.18)
      .fill({ color: 0x324c38, alpha: 0.2 })
      .stroke({ width: 8, color: 0xbdd88e, alpha: 0.22 });
  }

  private updateGridColors(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const lineGraphic = this.sceneGraph.gridLinesGraphic;
    if (this.isPlayground) {
      bgGraphic.tint = GRID_LOBBY_FILL_COLOR;
      lineGraphic.tint = GRID_LOBBY_LINE_COLOR;
      lineGraphic.alpha = 0.4;
    } else {
      bgGraphic.tint = lerpColor(
        GRID_DAY_FILL_COLOR,
        GRID_NIGHT_FILL_COLOR,
        this.gridNightBlend,
      );
      lineGraphic.tint = lerpColor(
        GRID_DAY_LINE_COLOR,
        GRID_NIGHT_LINE_COLOR,
        applyContrastLag(this.gridNightBlend),
      );
      const lineVisibility = Math.min(
        1,
        Math.max(0, 2 * Math.abs(this.gridNightBlend - 0.5)),
      );
      lineGraphic.alpha = 0.4 * lineVisibility;
    }
  }

  private redrawScreenGridLinesIfNeeded(app: Application): void {
    const { x: camX, y: camY } = this.viewportController.getCameraPosition();
    const scale = this.viewportController.getCurrentScale(app);
    const sw = app.screen.width;
    const sh = app.screen.height;

    if (
      Math.abs(this.lastGridCameraX - camX) < 0.0001 &&
      Math.abs(this.lastGridCameraY - camY) < 0.0001 &&
      this.lastGridScale === scale &&
      this.lastGridScreenWidth === sw &&
      this.lastGridScreenHeight === sh
    ) {
      return;
    }

    this.lastGridCameraX = camX;
    this.lastGridCameraY = camY;
    this.lastGridScale = scale;
    this.lastGridScreenWidth = sw;
    this.lastGridScreenHeight = sh;

    const cellPx = GRID_CELL_SIZE * scale;
    const offX = ((camX % GRID_CELL_SIZE) * scale + cellPx) % cellPx;
    const offY = ((camY % GRID_CELL_SIZE) * scale + cellPx) % cellPx;

    this.redrawScreenGridLines(app, offX, offY, cellPx);
  }

  private redrawScreenGridLines(
    app: Application,
    offX: number,
    offY: number,
    cellPx: number,
  ): void {
    const g = this.sceneGraph.gridLinesGraphic;
    const sw = app.screen.width;
    const sh = app.screen.height;

    g.clear();
    for (let x = sw / 2 - offX; x >= -cellPx; x -= cellPx) {
      g.moveTo(x, 0).lineTo(x, sh);
    }
    for (let x = sw / 2 - offX + cellPx; x <= sw + cellPx; x += cellPx) {
      g.moveTo(x, 0).lineTo(x, sh);
    }
    for (let y = sh / 2 - offY; y >= -cellPx; y -= cellPx) {
      g.moveTo(0, y).lineTo(sw, y);
    }
    for (let y = sh / 2 - offY + cellPx; y <= sh + cellPx; y += cellPx) {
      g.moveTo(0, y).lineTo(sw, y);
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 1 });
  }

  private redrawMinimap(app: Application): void {
    const map = this.mapState;
    const g = this.minimapGraphic;
    g.clear();
    this.minimapLabel.text = "";
    if (!map) {
      return;
    }

    const size = MINIMAP_SIZE;
    const x = app.screen.width - size - MINIMAP_PADDING;
    const y = MINIMAP_PADDING;
    if (!this.infrastructureState.commsActive) {
      g.roundRect(x, y, size, 46, 6)
        .fill({ color: 0x111820, alpha: 0.84 })
        .stroke({ width: 1, color: 0xff775c, alpha: 0.55 });
      this.minimapLabel.text = "COMMS OFFLINE";
      this.minimapLabel.x = x + 8;
      this.minimapLabel.y = y + 16;
      return;
    }

    const scaleX = size / this.worldSize.w;
    const scaleY = size / this.worldSize.h;
    g.roundRect(x, y, size, size, 6)
      .fill({ color: 0x111820, alpha: 0.78 })
      .stroke({ width: 1, color: 0xc6d4df, alpha: 0.45 });

    for (const sector of map.sectors) {
      const sx = x + sector.minX * scaleX;
      const sy = y + sector.minY * scaleY;
      const sw = (sector.maxX - sector.minX) * scaleX;
      const sh = (sector.maxY - sector.minY) * scaleY;
      g.rect(sx, sy, sw, sh)
        .fill({
          color: minimapSectorColor(sector.archetype),
          alpha: sector.id === map.centerSectorId ? 0.42 : 0.24,
        })
        .stroke({ width: 1, color: 0xffffff, alpha: 0.16 });
    }

    for (const marker of map.markers) {
      if (!marker.discoveredByDefault && marker.importance !== "major") {
        continue;
      }
      const mx = x + marker.x * scaleX;
      const my = y + marker.y * scaleY;
      const radius = marker.importance === "major" ? 3.5 : 2;
      g.circle(mx, my, radius).fill({
        color: minimapMarkerColor(marker.archetype),
        alpha: marker.importance === "reward" ? 0.55 : 0.9,
      });
    }

    if (this.visibilityState?.restricted) {
      const vx = x + this.visibilityState.center.x * scaleX;
      const vy = y + this.visibilityState.center.y * scaleY;
      g.circle(
        vx,
        vy,
        Math.max(3, this.visibilityState.radius * scaleX),
      ).stroke({
        width: 1,
        color: 0xa9d4ff,
        alpha: 0.28,
      });
    }

    for (const player of this.minimapPlayers) {
      const px = x + player.x * scaleX;
      const py = y + player.y * scaleY;
      if (player.isSelf) {
        g.circle(px, py, 3.5).fill({
          color: 0xffffff,
          alpha: 0.98,
        });
        g.circle(px, py, 5.5).stroke({
          width: 2,
          color: 0x53e8ff,
          alpha: 0.9,
        });
        continue;
      }
      g.circle(px, py, 3.5).fill({
        color: 0xffffff,
        alpha: 0.96,
      });
      g.circle(px, py, 5.5).stroke({
        width: 2,
        color: 0x56e86b,
        alpha: 0.9,
      });
    }

    this.minimapLabel.text = "MAP";
    this.minimapLabel.x = x + 8;
    this.minimapLabel.y = y + 6;
  }

  private syncCullViewport(app: Application): void {
    const bounds = this.viewportController.getWorldViewportBounds(app);
    this.cullingController.updateViewport(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
  }
}

function clipRayToWorldBounds(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  worldSize: WorldSize,
): { x: number; y: number } | null {
  const rayLength = Math.hypot(directionX, directionY);
  if (rayLength <= MIN_DISTANCE_EPSILON) {
    return null;
  }

  const dx = directionX / rayLength;
  const dy = directionY / rayLength;
  const ts: number[] = [];
  const minX = 0;
  const minY = 0;
  const maxX = worldSize.w;
  const maxY = worldSize.h;

  if (Math.abs(dx) > MIN_DISTANCE_EPSILON) {
    ts.push((minX - originX) / dx, (maxX - originX) / dx);
  }
  if (Math.abs(dy) > MIN_DISTANCE_EPSILON) {
    ts.push((minY - originY) / dy, (maxY - originY) / dy);
  }

  let closestT = Number.POSITIVE_INFINITY;
  for (const t of ts) {
    if (!Number.isFinite(t) || t <= 0) {
      continue;
    }
    const x = originX + dx * t;
    const y = originY + dy * t;
    if (
      x < minX - 0.01 ||
      x > maxX + 0.01 ||
      y < minY - 0.01 ||
      y > maxY + 0.01
    ) {
      continue;
    }
    if (t < closestT) {
      closestT = t;
    }
  }

  if (!Number.isFinite(closestT)) {
    return null;
  }

  return {
    x: originX + dx * closestT,
    y: originY + dy * closestT,
  };
}

function minimapSectorColor(archetype: string): number {
  switch (archetype) {
    case "home":
      return 0x8f99a8;
    case "extraction":
      return 0xddcc44;
    case "dungeon":
      return 0x6f6478;
    case "military":
      return 0x56636f;
    case "forest":
      return 0x3d7a47;
    default:
      return 0x607070;
  }
}

function worldSectorColor(archetype: string): number {
  switch (archetype) {
    case "home":
      return 0xa8b9a6;
    case "extraction":
      return 0xb8a54e;
    case "dungeon":
      return 0x55545d;
    case "military":
      return 0x596550;
    case "forest":
      return 0x2e6b3a;
    case "lake_district":
    case "swamp":
      return 0x40747a;
    case "industrial_yard":
    case "quarry":
    case "bunker_edge":
      return 0x6a665c;
    default:
      return 0x78906e;
  }
}

function minimapMarkerColor(archetype: string): number {
  switch (archetype) {
    case "extraction":
      return 0xffdd55;
    case "dungeon":
      return 0xcaa7ff;
    case "military":
      return 0xff7777;
    case "forest":
      return 0x82df77;
    case "home":
      return 0xffffff;
    default:
      return 0xc8d5d0;
  }
}

function drawWorldHelipad(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
): void {
  g.circle(x, y, radius)
    .fill({ color: 0xddcc44, alpha: 0.55 })
    .stroke({ width: 6, color: 0xaa9920, alpha: 0.9 });
  g.circle(x, y, radius * 0.82).stroke({
    width: 3,
    color: 0xaa9920,
    alpha: 0.7,
  });

  const hBarW = radius * 0.18;
  const hBarH = radius * 0.75;
  const hCrossH = radius * 0.15;
  const hCrossW = radius * 0.46;
  g.rect(x - hCrossW / 2 - hBarW, y - hBarH / 2, hBarW, hBarH).fill({
    color: 0x6b5500,
    alpha: 0.85,
  });
  g.rect(x + hCrossW / 2, y - hBarH / 2, hBarW, hBarH).fill({
    color: 0x6b5500,
    alpha: 0.85,
  });
  g.rect(
    x - hCrossW / 2 - hBarW,
    y - hCrossH / 2,
    hCrossW + hBarW * 2,
    hCrossH,
  ).fill({ color: 0x6b5500, alpha: 0.85 });
}

function inverseLerp(start: number, end: number, value: number): number {
  if (Math.abs(end - start) <= MIN_DISTANCE_EPSILON) {
    return value >= end ? 1 : 0;
  }
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}

function lerp(start: number, end: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return start + (end - start) * clamped;
}

function lerpColor(start: number, end: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const startR = (start >> 16) & 0xff;
  const startG = (start >> 8) & 0xff;
  const startB = start & 0xff;
  const endR = (end >> 16) & 0xff;
  const endG = (end >> 8) & 0xff;
  const endB = end & 0xff;
  const r = Math.round(startR + (endR - startR) * clamped);
  const g = Math.round(startG + (endG - startG) * clamped);
  const b = Math.round(startB + (endB - startB) * clamped);
  return (r << 16) | (g << 8) | b;
}

function applyContrastLag(blend: number): number {
  const lag = 0.12;
  if (blend >= 0.5) {
    return Math.min(1, blend + lag);
  }
  return Math.max(0, blend - lag);
}

import {
  BlurFilter,
  Graphics,
  Text,
  TextStyle,
  type Application,
  type Container,
} from "pixi.js";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { HelipadOverlay } from "@client/render/pixi/HelipadOverlay.ts";
import {
  PixiPlacementPreview,
  type PlacementPreviewState,
} from "@client/render/pixi/PixiPlacementPreview.ts";
import { PixiSceneGraph } from "@client/render/pixi/PixiSceneGraph.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import { PixiCullingController } from "@client/render/pixi/PixiCullingController.ts";
import type {
  VisibilityBlockerShape,
  WorldSize,
} from "@client/render/renderTypes.ts";
import type { ExtractionSnapshot, MapSnapshot } from "@shared/net/snapshots.ts";
import type { VisibilityContext } from "@shared/world/Visibility.ts";
import { getVisibilityContextForMap } from "@shared/world/Visibility.ts";

const GRID_CELL_SIZE = 100;
const HOME_BASE_WIDTH = 1600;
const HOME_BASE_HEIGHT = 1200;
const HOME_BASE_OUTER_COLOR = 0xc1c8d3;
const HOME_BASE_INNER_COLOR = 0x8f99a8;
const HOME_BASE_ACCENT_COLOR = 0xe4e9f1;
const HOME_BASE_SHADOW_COLOR = 0x5c6470;
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
const MAX_VISIBILITY_BLOCKERS = 48;
const VISIBILITY_SAMPLE_COUNT = 96;
// Offset rays slightly around edges/corners to avoid precision gaps in LOS cuts.
const VISIBILITY_ANGLE_EPSILON = 0.0005;
// Use a game-scale epsilon to avoid precision issues with large world coords.
const MIN_DISTANCE_EPSILON = 1e-6;
// Minimum 3 points (triangle) => 6 coordinate entries in the polygon array.
const MIN_POLYGON_COORDINATES = 6;
// Fraction of the screen's min dimension to keep clear at the vignette center.
const VIGNETTE_HOLE_RATIO = 0.58;
// Vertical scaling for the vignette ellipse (squash on Y axis).
const VIGNETTE_ELLIPSE_RATIO = 0.88;
// Minimum blur padding in pixels for the vignette edge.
const VIGNETTE_MIN_BLUR_PADDING = 120;
// Extra blur padding derived from the vignette hole radius.
const VIGNETTE_BLUR_PADDING_RATIO = 0.35;
// Overscan the vignette rect beyond screen bounds to prevent edge artifacts.
const VIGNETTE_RECT_PADDING = 512;
const DARKNESS_OVERLAY_COLOR = 0x030507;
const VIGNETTE_OVERLAY_COLOR = 0x000000;

export class PixiWorldView {
  private readonly sceneGraph = new PixiSceneGraph();
  private readonly viewportController: PixiViewportController;
  private readonly cullingController = new PixiCullingController();
  private readonly placementPreview = new PixiPlacementPreview();
  private readonly sniperAimGuide = new Graphics();
  private readonly helipadOverlay = new HelipadOverlay();
  private readonly minimapGraphic = new Graphics();
  private readonly minimapLabel = new Text(
    "",
    new TextStyle({
      fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
      fontSize: 10,
      fill: 0xe8f5e7,
    }),
  );
  private readonly darknessOverlay = new Graphics();
  private readonly darknessVignette = new Graphics();
  private readonly darknessVignetteBlur = new BlurFilter({
    strength: 18,
    quality: 1,
  });
  private pendingExtractionState: ExtractionSnapshot | null = null;
  private mapState: MapSnapshot | null = null;
  private visibilityState: VisibilityContext | null = null;
  private visibilityBlockers: VisibilityBlockerShape[] = [];
  private worldSize: WorldSize;
  private gridNightBlend = 0;
  private isPlayground = false;
  private lastGridCameraX = Number.NaN;
  private lastGridCameraY = Number.NaN;
  private lastGridScale = Number.NaN;
  private lastGridScreenWidth = -1;
  private lastGridScreenHeight = -1;

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.viewportController = new PixiViewportController(worldSize);
    this.sniperAimGuide.visible = false;
    this.sceneGraph.placementLayer.addChild(this.sniperAimGuide);
    this.sceneGraph.entityLayer.addChild(this.helipadOverlay.container);
    this.sceneGraph.overlayLayer.addChild(
      this.darknessOverlay,
      this.darknessVignette,
    );
    this.darknessVignette.filters = [this.darknessVignetteBlur];
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
    this.redrawLightsOutOverlay(app);
    this.redrawMinimap(app);
    this.helipadOverlay.update(this.pendingExtractionState, deltaMs);
  }

  public updateExtractionState(state: ExtractionSnapshot | null): void {
    this.pendingExtractionState = state;
  }

  public updateMapState(map: MapSnapshot | null): void {
    this.mapState = map;
    this.drawGridGeometry();
  }

  public updatePlayerVisibility(player: { x: number; y: number } | null): void {
    this.visibilityState = player
      ? getVisibilityContextForMap(this.mapState, player)
      : null;
  }

  public updateVisibilityBlockers(
    blockers: readonly VisibilityBlockerShape[],
  ): void {
    this.visibilityBlockers = blockers.slice(0, MAX_VISIBILITY_BLOCKERS);
  }

  public setGridNightBlend(blend: number): void {
    this.gridNightBlend = Math.max(0, Math.min(1, blend));
    this.updateGridColors();
  }

  public setPlaygroundMode(isPlayground: boolean): void {
    if (this.isPlayground === isPlayground) {
      return;
    }
    this.isPlayground = isPlayground;
    this.updateGridColors();
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
    const centerSector = map.sectors.find(
      (sector) => sector.id === map.centerSectorId,
    );
    for (const sector of map.sectors) {
      const width = sector.maxX - sector.minX;
      const height = sector.maxY - sector.minY;
      g.rect(sector.minX, sector.minY, width, height)
        .fill({ color: worldSectorColor(sector.archetype), alpha: 0.16 })
        .stroke({ width: 5, color: 0x1e2a2f, alpha: 0.16 });
      this.drawSectorTexture(g, sector);
    }

    if (centerSector) {
      const cx = (centerSector.minX + centerSector.maxX) / 2;
      const cy = (centerSector.minY + centerSector.maxY) / 2;
      for (const sector of map.sectors) {
        if (sector.id === centerSector.id) {
          continue;
        }
        const sx = (sector.minX + sector.maxX) / 2;
        const sy = (sector.minY + sector.maxY) / 2;
        g.moveTo(cx, cy)
          .lineTo(sx, sy)
          .stroke({ width: 54, color: 0x7f765e, alpha: 0.18 });
        g.moveTo(cx, cy)
          .lineTo(sx, sy)
          .stroke({ width: 18, color: 0xd2c292, alpha: 0.16 });
      }
    }

    for (const feature of map.features) {
      this.drawMapFeature(g, feature);
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

  private drawMapFeature(
    g: Graphics,
    feature: MapSnapshot["features"][number],
  ): void {
    if (feature.role.startsWith("dungeon_")) {
      this.drawDungeonRoomFeature(g, feature);
      return;
    }

    const width = feature.maxX - feature.minX;
    const height = feature.maxY - feature.minY;
    const color = featureColor(feature.role, feature.risk);
    const borderColor = feature.hasReward ? 0xf2c15b : riskColor(feature.risk);
    const alpha = feature.risk === "boss" ? 0.32 : 0.2;

    if (feature.role === "pond") {
      g.ellipse(feature.centerX, feature.centerY, width / 2, height / 2)
        .fill({ color: 0x315f70, alpha: 0.35 })
        .stroke({ width: 4, color: 0x78a9b4, alpha: 0.28 });
      return;
    }

    if (feature.role === "trail" || feature.role === "approach_route") {
      g.moveTo(feature.minX, feature.centerY)
        .lineTo(feature.maxX, feature.centerY)
        .stroke({ width: Math.max(24, height * 0.25), color, alpha: 0.2 });
      g.moveTo(feature.minX, feature.centerY)
        .lineTo(feature.maxX, feature.centerY)
        .stroke({ width: 5, color: 0xe0d2a4, alpha: 0.18 });
      return;
    }

    if (feature.role === "helipad") {
      drawWorldHelipad(g, feature.centerX, feature.centerY, width * 0.34);
      return;
    }

    const radius = feature.role.includes("tower") ? 999 : 10;
    g.roundRect(feature.minX, feature.minY, width, height, radius)
      .fill({ color, alpha })
      .stroke({
        width: feature.risk === "boss" ? 7 : 4,
        color: borderColor,
        alpha: 0.34,
      });

    if (feature.role === "boss" || feature.role === "reward_cache") {
      g.circle(feature.centerX, feature.centerY, Math.min(width, height) * 0.22)
        .fill({ color: 0x3b263f, alpha: 0.18 })
        .stroke({ width: 6, color: 0xb779ff, alpha: 0.3 });
    }
  }

  private drawDungeonRoomFeature(
    g: Graphics,
    feature: MapSnapshot["features"][number],
  ): void {
    const width = feature.maxX - feature.minX;
    const height = feature.maxY - feature.minY;
    const floorColor = dungeonFloorColor(feature.role);
    const glowColor = dungeonGlowColor(feature.role, feature.risk);
    const wallColor = 0x1e2021;
    const trimColor = feature.hasReward ? 0xd9a84a : 0x7d7769;
    const wall = 34;

    g.roundRect(
      feature.minX - wall,
      feature.minY - wall,
      width + wall * 2,
      height + wall * 2,
      12,
    )
      .fill({ color: wallColor, alpha: 0.82 })
      .stroke({ width: 10, color: 0x998f78, alpha: 0.36 });
    g.roundRect(feature.minX, feature.minY, width, height, 6)
      .fill({ color: floorColor, alpha: 0.62 })
      .stroke({ width: 4, color: trimColor, alpha: 0.28 });

    const tile = 64;
    for (let x = feature.minX + tile; x < feature.maxX; x += tile) {
      g.moveTo(x, feature.minY)
        .lineTo(x, feature.maxY)
        .stroke({ width: 1, color: 0xbab39d, alpha: 0.07 });
    }
    for (let y = feature.minY + tile; y < feature.maxY; y += tile) {
      g.moveTo(feature.minX, y)
        .lineTo(feature.maxX, y)
        .stroke({ width: 1, color: 0xbab39d, alpha: 0.07 });
    }

    g.circle(feature.centerX, feature.centerY, Math.min(width, height) * 0.16)
      .fill({ color: glowColor, alpha: 0.16 })
      .stroke({ width: 5, color: glowColor, alpha: 0.32 });

    if (feature.role === "dungeon_crossroads") {
      g.moveTo(feature.minX + width * 0.18, feature.centerY)
        .lineTo(feature.maxX - width * 0.18, feature.centerY)
        .moveTo(feature.centerX, feature.minY + height * 0.18)
        .lineTo(feature.centerX, feature.maxY - height * 0.18)
        .stroke({ width: 18, color: 0xc2b080, alpha: 0.16 });
    }

    if (
      feature.role === "dungeon_boss" ||
      feature.role === "dungeon_mini_boss"
    ) {
      g.circle(
        feature.centerX,
        feature.centerY,
        Math.min(width, height) * 0.28,
      ).stroke({ width: 14, color: 0x7d2f42, alpha: 0.24 });
    }
  }

  private drawSectorTexture(
    g: Graphics,
    sector: MapSnapshot["sectors"][number],
  ): void {
    const width = sector.maxX - sector.minX;
    const height = sector.maxY - sector.minY;
    const count =
      sector.archetype === "forest"
        ? 42
        : sector.archetype === "military" || sector.archetype === "dungeon"
          ? 18
          : 28;
    for (let index = 0; index < count; index += 1) {
      const rx = seededUnit(`${sector.id}:x:${index}`);
      const ry = seededUnit(`${sector.id}:y:${index}`);
      const x = sector.minX + width * (0.08 + rx * 0.84);
      const y = sector.minY + height * (0.08 + ry * 0.84);
      if (sector.archetype === "forest") {
        g.circle(x, y, 42 + seededUnit(`${sector.id}:r:${index}`) * 38).fill({
          color: 0x255f32,
          alpha: 0.2,
        });
        continue;
      }
      if (sector.archetype === "dungeon") {
        g.rect(x - 72, y - 56, 144, 112)
          .fill({ color: 0x303335, alpha: 0.28 })
          .stroke({ width: 6, color: 0x9a927e, alpha: 0.22 });
        continue;
      }
      if (sector.archetype === "military") {
        g.rect(x - 90, y - 54, 180, 108)
          .fill({ color: 0x4c5a4f, alpha: 0.2 })
          .stroke({ width: 4, color: 0x1d2424, alpha: 0.22 });
        continue;
      }
      g.roundRect(x - 58, y - 42, 116, 84, 8)
        .fill({ color: 0x7b7465, alpha: 0.14 })
        .stroke({ width: 3, color: 0x2d302b, alpha: 0.18 });
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

  private redrawLightsOutOverlay(app: Application): void {
    const g = this.darknessOverlay;
    const vignette = this.darknessVignette;
    g.clear();
    vignette.clear();
    const visibility = this.visibilityState;
    if (!visibility?.restricted) {
      g.visible = false;
      vignette.visible = false;
      return;
    }
    g.visible = true;
    vignette.visible = true;
    const sw = app.screen.width;
    const sh = app.screen.height;
    const visiblePolygon = this.buildVisibilityPolygon(app, visibility);
    if (!visiblePolygon) {
      return;
    }
    g.rect(0, 0, sw, sh).fill({ color: DARKNESS_OVERLAY_COLOR, alpha: 0.9 });
    g.poly(visiblePolygon).cut();

    this.drawVisibilityVignette(app);
  }

  private buildVisibilityPolygon(
    app: Application,
    visibility: VisibilityContext,
  ): number[] | null {
    const centerX = visibility.center.x;
    const centerY = visibility.center.y;
    const angles = this.collectVisibilityAngles(
      centerX,
      centerY,
      visibility.radius,
    );
    angles.sort((left, right) => left - right);

    const points: number[] = [];
    for (const angle of angles) {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const distance = this.getVisibilityRayDistance(
        centerX,
        centerY,
        dirX,
        dirY,
        visibility.radius,
      );
      const worldX = centerX + dirX * distance;
      const worldY = centerY + dirY * distance;
      const screen = this.worldToScreen(app, worldX, worldY);
      if (!screen) {
        continue;
      }
      points.push(screen.x, screen.y);
    }

    if (points.length < MIN_POLYGON_COORDINATES) {
      return null;
    }
    return points;
  }

  private collectVisibilityAngles(
    originX: number,
    originY: number,
    radius: number,
  ): number[] {
    const angles: number[] = [];
    const twoPi = Math.PI * 2;

    for (let i = 0; i < VISIBILITY_SAMPLE_COUNT; i += 1) {
      angles.push((i / VISIBILITY_SAMPLE_COUNT) * twoPi);
    }

    for (const blocker of this.visibilityBlockers) {
      if (blocker.kind === "rect") {
        const minX = blocker.minX;
        const minY = blocker.minY;
        const maxX = blocker.maxX;
        const maxY = blocker.maxY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const maxExtent = Math.hypot(maxX - minX, maxY - minY) / 2;
        if (
          Math.hypot(centerX - originX, centerY - originY) >
          radius + maxExtent
        ) {
          continue;
        }
        for (const [x, y] of [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
        ]) {
          const baseAngle = Math.atan2(y - originY, x - originX);
          angles.push(
            baseAngle - VISIBILITY_ANGLE_EPSILON,
            baseAngle,
            baseAngle + VISIBILITY_ANGLE_EPSILON,
          );
        }
        continue;
      }

      const dx = blocker.centerX - originX;
      const dy = blocker.centerY - originY;
      const distance = Math.hypot(dx, dy);
      if (distance <= blocker.radius + MIN_DISTANCE_EPSILON) {
        continue;
      }
      if (distance - blocker.radius > radius) {
        continue;
      }
      const centerAngle = Math.atan2(dy, dx);
      const offset = Math.asin(
        Math.min(1, blocker.radius / Math.max(distance, MIN_DISTANCE_EPSILON)),
      );
      for (const sign of [-1, 1]) {
        const baseAngle = centerAngle + sign * offset;
        angles.push(
          baseAngle - VISIBILITY_ANGLE_EPSILON,
          baseAngle,
          baseAngle + VISIBILITY_ANGLE_EPSILON,
        );
      }
    }

    return angles;
  }

  private getVisibilityRayDistance(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    maxDistance: number,
  ): number {
    let nearest = maxDistance;
    for (const blocker of this.visibilityBlockers) {
      const distance =
        blocker.kind === "rect"
          ? this.rayIntersectRect(originX, originY, dirX, dirY, blocker)
          : this.rayIntersectCircle(originX, originY, dirX, dirY, blocker);
      if (distance === null || distance >= nearest) {
        continue;
      }
      nearest = distance;
    }
    return nearest;
  }

  private rayIntersectRect(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    rect: Extract<VisibilityBlockerShape, { kind: "rect" }>,
  ): number | null {
    if (
      originX >= rect.minX &&
      originX <= rect.maxX &&
      originY >= rect.minY &&
      originY <= rect.maxY
    ) {
      return null;
    }

    let tMin = Number.NEGATIVE_INFINITY;
    let tMax = Number.POSITIVE_INFINITY;

    if (Math.abs(dirX) < MIN_DISTANCE_EPSILON) {
      if (originX < rect.minX || originX > rect.maxX) {
        return null;
      }
    } else {
      const tx1 = (rect.minX - originX) / dirX;
      const tx2 = (rect.maxX - originX) / dirX;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (Math.abs(dirY) < MIN_DISTANCE_EPSILON) {
      if (originY < rect.minY || originY > rect.maxY) {
        return null;
      }
    } else {
      const ty1 = (rect.minY - originY) / dirY;
      const ty2 = (rect.maxY - originY) / dirY;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    if (tMax < Math.max(tMin, 0)) {
      return null;
    }
    return Math.max(tMin, 0);
  }

  private rayIntersectCircle(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    circle: Extract<VisibilityBlockerShape, { kind: "circle" }>,
  ): number | null {
    const ocX = originX - circle.centerX;
    const ocY = originY - circle.centerY;
    const distanceSq = ocX * ocX + ocY * ocY;
    const radiusSq = circle.radius * circle.radius;
    if (distanceSq <= radiusSq) {
      return null;
    }

    const b = ocX * dirX + ocY * dirY;
    const c = distanceSq - radiusSq;
    const discriminant = b * b - c;
    if (discriminant < 0) {
      return null;
    }
    const sqrt = Math.sqrt(discriminant);
    const t = -b - sqrt;
    if (t >= 0) {
      return t;
    }
    const tFar = -b + sqrt;
    return tFar >= 0 ? tFar : null;
  }

  private drawVisibilityVignette(app: Application): void {
    const g = this.darknessVignette;
    const sw = app.screen.width;
    const sh = app.screen.height;
    const cx = sw / 2;
    const cy = sh / 2;
    const minDim = Math.min(sw, sh);
    const holeR = minDim * VIGNETTE_HOLE_RATIO;

    g.rect(
      -VIGNETTE_RECT_PADDING,
      -VIGNETTE_RECT_PADDING,
      sw + VIGNETTE_RECT_PADDING * 2,
      sh + VIGNETTE_RECT_PADDING * 2,
    ).fill({
      color: VIGNETTE_OVERLAY_COLOR,
      alpha: 0.3,
    });
    g.ellipse(cx, cy, holeR, holeR * VIGNETTE_ELLIPSE_RATIO).cut();

    // Minimum padding keeps blur coverage on very small screens.
    this.darknessVignetteBlur.padding = Math.max(
      VIGNETTE_MIN_BLUR_PADDING,
      holeR * VIGNETTE_BLUR_PADDING_RATIO,
    );
    g.filterArea = app.screen;
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

    const playerX = this.visibilityState?.center.x;
    const playerY = this.visibilityState?.center.y;
    if (playerX !== undefined && playerY !== undefined) {
      g.circle(x + playerX * scaleX, y + playerY * scaleY, 3).fill({
        color: 0xffffff,
        alpha: 1,
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

function featureColor(role: string, risk: string): number {
  if (role.includes("dungeon") || role === "reward_cache") {
    return 0x4b4650;
  }
  if (
    role.includes("armory") ||
    role.includes("command") ||
    role.includes("barracks")
  ) {
    return 0x56624f;
  }
  if (
    role.includes("forest") ||
    role === "camp" ||
    role === "cabin" ||
    role === "shrine"
  ) {
    return 0x385b36;
  }
  if (role.includes("residential") || role.includes("ruin")) {
    return 0x756c58;
  }
  if (risk === "boss") {
    return 0x5d3940;
  }
  return 0x5f6558;
}

function riskColor(risk: string): number {
  switch (risk) {
    case "boss":
      return 0xe35c46;
    case "high":
      return 0xd88a3d;
    case "medium":
      return 0xd8c36a;
    default:
      return 0xa5c58a;
  }
}

function dungeonFloorColor(role: string): number {
  switch (role) {
    case "dungeon_treasure":
      return 0x6b5630;
    case "dungeon_rest":
      return 0x4f563f;
    case "dungeon_armory":
      return 0x4c4d4a;
    case "dungeon_hazard":
      return 0x4a3448;
    case "dungeon_objective":
      return 0x35475a;
    case "dungeon_mini_boss":
    case "dungeon_boss":
      return 0x46333b;
    default:
      return 0x4d5148;
  }
}

function dungeonGlowColor(role: string, risk: string): number {
  switch (role) {
    case "dungeon_treasure":
      return 0xffc34f;
    case "dungeon_rest":
      return 0x7be0a4;
    case "dungeon_objective":
      return 0x7dbdff;
    case "dungeon_hazard":
      return 0xb77dff;
    case "dungeon_boss":
      return 0xff4e72;
    default:
      return riskColor(risk);
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

function seededUnit(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
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

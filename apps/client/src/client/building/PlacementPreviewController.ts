import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { getEntityContent, getItemContent } from "@shared/content/catalog.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  getHitboxBounds,
  offsetHitboxBounds,
  resolveHitboxRects,
  type HitboxBounds,
  type HitboxRect,
} from "@shared/geometry/hitbox.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import { validateBuildPlacement } from "@shared/gameplay/rules/buildPlacementValidation.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { GridIndex } from "@shared/spatial/GridIndex.ts";

type CachedPlacementBuildProfile = {
  itemTypeId: ResourceId;
  buildsEntityTypeId: ResourceId;
  hitboxProfiles: Record<string, readonly HitboxRect[]>;
  activeHitboxProfile?: string;
  previewProfile: readonly HitboxRect[];
  previewLocalBounds: HitboxBounds;
};

type PlacementPreviewOutput = Parameters<
  PixiRenderer["setPlacementPreview"]
>[0];

export class PlacementPreviewController {
  private placementIndexDirty = true;
  private previewDirty = true;
  private placementIndexedWorld?: ClientWorld;
  private placementGrid?: GridIndex<ClientEntity>;
  private placementGridCellSize = -1;
  private readonly placementWorkingCandidates: ClientEntity[] = [];
  private placementSpatialRevision = 0;
  private placementProfileCache: CachedPlacementBuildProfile | undefined;
  private lastEmittedPreviewState: PlacementPreviewOutput = null;
  private lastComputedPreviewState: PlacementPreviewOutput = null;
  private lastComputedWorld?: ClientWorld;
  private lastComputedPlayerId = -1;
  private lastComputedPlayerStateVersion = -1;
  private lastComputedPointerX = Number.NaN;
  private lastComputedPointerY = Number.NaN;
  private lastComputedSelectedItemTypeId: ResourceId | undefined;
  private lastComputedSpatialRevision = -1;
  private lastComputedWorldWidth = -1;
  private lastComputedWorldHeight = -1;

  public invalidate(options?: {
    spatialIndex?: boolean;
    preview?: boolean;
  }): void {
    if (options?.spatialIndex ?? true) {
      this.placementIndexDirty = true;
    }
    if (options?.preview ?? true) {
      this.previewDirty = true;
    }
  }

  public reset(renderer: PixiRenderer): void {
    this.emitPlacementPreview(renderer, null);
    this.placementGrid?.clear();
    this.placementWorkingCandidates.length = 0;
    this.placementIndexDirty = true;
    this.previewDirty = true;
    this.placementIndexedWorld = undefined;
    this.placementGrid = undefined;
    this.placementGridCellSize = -1;
    this.placementSpatialRevision = 0;
    this.placementProfileCache = undefined;
    this.lastComputedPreviewState = null;
    this.lastComputedWorld = undefined;
    this.lastComputedPlayerId = -1;
    this.lastComputedPlayerStateVersion = -1;
    this.lastComputedPointerX = Number.NaN;
    this.lastComputedPointerY = Number.NaN;
    this.lastComputedSelectedItemTypeId = undefined;
    this.lastComputedSpatialRevision = -1;
    this.lastComputedWorldWidth = -1;
    this.lastComputedWorldHeight = -1;
  }

  public sync(options: {
    renderer: PixiRenderer;
    world: ClientWorld | undefined;
    player: ClientEntity | undefined;
    pointerAimTarget: { x: number; y: number } | undefined;
    gameConfig: GameConfig;
  }): void {
    const { renderer, world, player, pointerAimTarget, gameConfig } = options;
    if (!world || !player || !player.alive) {
      this.emitPlacementPreview(renderer, null);
      return;
    }

    const inventory = player.inventory;
    if (!inventory) {
      this.emitPlacementPreview(renderer, null);
      return;
    }

    const selectedSlot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
    if (selectedSlot?.kind !== "buildable") {
      this.placementProfileCache = undefined;
      this.emitPlacementPreview(renderer, null);
      return;
    }

    if (!pointerAimTarget) {
      this.emitPlacementPreview(renderer, null);
      return;
    }

    const buildProfile = this.resolvePlacementBuildProfile(selectedSlot.typeId);
    if (!buildProfile) {
      this.emitPlacementPreview(renderer, null);
      return;
    }

    const snappedX = Math.round(pointerAimTarget.x);
    const snappedY = Math.round(pointerAimTarget.y);
    const placementGrid = this.ensurePlacementGrid(
      gameConfig.collision.spatialCellSize,
    );
    this.ensurePlacementSpatialIndex(world, placementGrid);

    if (
      !this.previewDirty &&
      this.lastComputedWorld === world &&
      this.lastComputedPlayerId === player.id &&
      this.lastComputedPlayerStateVersion === player.stateVersion &&
      this.lastComputedPointerX === snappedX &&
      this.lastComputedPointerY === snappedY &&
      this.lastComputedSelectedItemTypeId === selectedSlot.typeId &&
      this.lastComputedSpatialRevision === this.placementSpatialRevision &&
      this.lastComputedWorldWidth === gameConfig.worldSize.w &&
      this.lastComputedWorldHeight === gameConfig.worldSize.h
    ) {
      this.emitPlacementPreview(renderer, this.lastComputedPreviewState);
      return;
    }

    const previewRects = resolveHitboxRects(
      snappedX,
      snappedY,
      buildProfile.previewProfile,
    );
    const previewBounds = offsetHitboxBounds(
      buildProfile.previewLocalBounds,
      snappedX,
      snappedY,
    );

    const candidates = placementGrid.queryBox(
      previewBounds.minX,
      previewBounds.minY,
      previewBounds.maxX,
      previewBounds.maxY,
      this.placementWorkingCandidates,
      (entity) => entity.id,
    );
    const blockerHitboxes = candidates.map((entity) =>
      resolveHitboxRects(entity.x, entity.y, entity.hitboxes),
    );
    const validation = validateBuildPlacement({
      playerX: player.x,
      playerY: player.y,
      targetX: pointerAimTarget.x,
      targetY: pointerAimTarget.y,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: gameConfig.worldSize.w,
      worldHeight: gameConfig.worldSize.h,
      placementHitboxes: previewRects,
      placementBounds: previewBounds,
      playerHitboxes: resolveHitboxRects(player.x, player.y, player.hitboxes),
      blockerHitboxes,
    });

    const nextPreviewState: PlacementPreviewOutput = {
      visible: true,
      worldX: snappedX,
      worldY: snappedY,
      valid: validation.ok,
      typeId: buildProfile.buildsEntityTypeId,
      hitboxProfiles: buildProfile.hitboxProfiles,
      activeHitboxProfile: buildProfile.activeHitboxProfile,
    };
    this.lastComputedPreviewState = nextPreviewState;
    this.lastComputedWorld = world;
    this.lastComputedPlayerId = player.id;
    this.lastComputedPlayerStateVersion = player.stateVersion;
    this.lastComputedPointerX = snappedX;
    this.lastComputedPointerY = snappedY;
    this.lastComputedSelectedItemTypeId = selectedSlot.typeId;
    this.lastComputedSpatialRevision = this.placementSpatialRevision;
    this.lastComputedWorldWidth = gameConfig.worldSize.w;
    this.lastComputedWorldHeight = gameConfig.worldSize.h;
    this.previewDirty = false;
    this.emitPlacementPreview(renderer, nextPreviewState);
  }

  private resolvePlacementBuildProfile(
    selectedItemTypeId: ResourceId,
  ): CachedPlacementBuildProfile | undefined {
    if (this.placementProfileCache?.itemTypeId === selectedItemTypeId) {
      return this.placementProfileCache;
    }

    const itemContent = getItemContent(selectedItemTypeId);
    const buildsEntityTypeId = itemContent?.buildsEntityTypeId;
    if (!buildsEntityTypeId) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    const buildEntityContent = getEntityContent(buildsEntityTypeId);
    const hitboxProfiles = buildEntityContent?.hitboxProfiles;
    if (!hitboxProfiles) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    const activeProfileName = buildEntityContent.activeHitboxProfile;
    const previewProfile =
      (activeProfileName && hitboxProfiles[activeProfileName]) ??
      Object.values(hitboxProfiles)[0];
    if (!previewProfile) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    this.placementProfileCache = {
      itemTypeId: selectedItemTypeId,
      buildsEntityTypeId,
      hitboxProfiles,
      activeHitboxProfile: activeProfileName,
      previewProfile,
      previewLocalBounds: getHitboxBounds(previewProfile),
    };
    return this.placementProfileCache;
  }

  private ensurePlacementGrid(cellSize: number): GridIndex<ClientEntity> {
    if (!this.placementGrid || this.placementGridCellSize !== cellSize) {
      this.placementGrid = new GridIndex<ClientEntity>(cellSize);
      this.placementGridCellSize = cellSize;
      this.placementIndexDirty = true;
    }
    return this.placementGrid;
  }

  private ensurePlacementSpatialIndex(
    world: ClientWorld,
    placementGrid: GridIndex<ClientEntity>,
  ): void {
    if (!this.placementIndexDirty && this.placementIndexedWorld === world) {
      return;
    }

    placementGrid.clear();
    for (const entity of world.entities.values()) {
      if (!entity.alive) {
        continue;
      }
      if (entity.kind === "projectile" || entity.kind === "pickup") {
        continue;
      }
      const entityContent = getEntityContent(entity.typeId);
      if (entityContent?.collisionMode !== "static") {
        continue;
      }

      const bounds = offsetHitboxBounds(
        entity.hitboxBounds,
        entity.x,
        entity.y,
      );
      const span = placementGrid.spanFromBounds(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
      );
      placementGrid.addToCells(placementGrid.keysFromSpan(span), entity);
    }

    this.placementIndexDirty = false;
    this.placementIndexedWorld = world;
    this.placementSpatialRevision += 1;
    this.previewDirty = true;
  }

  private emitPlacementPreview(
    renderer: PixiRenderer,
    state: PlacementPreviewOutput,
  ): void {
    if (arePlacementPreviewStatesEqual(this.lastEmittedPreviewState, state)) {
      return;
    }
    renderer.setPlacementPreview(state);
    this.lastEmittedPreviewState = state;
  }
}

function arePlacementPreviewStatesEqual(
  left: PlacementPreviewOutput,
  right: PlacementPreviewOutput,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  return (
    left.visible === right.visible &&
    left.valid === right.valid &&
    left.worldX === right.worldX &&
    left.worldY === right.worldY &&
    left.typeId === right.typeId &&
    left.activeHitboxProfile === right.activeHitboxProfile &&
    left.hitboxProfiles === right.hitboxProfiles
  );
}

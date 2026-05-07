import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { getEntityContent, getItemContent } from "@shared/content/catalog.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import {
  getHitboxBounds,
  offsetHitboxBounds,
  resolveHitboxRects,
  type HitboxBounds,
  type HitboxRect,
} from "@shared/geometry/hitbox.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

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

const PLACEMENT_SPATIAL_CELL_SIZE = 160;
const PLACEMENT_KEY_OFFSET = 1 << 15;
const PLACEMENT_KEY_STRIDE = 1 << 16;
const STRUCTURE_TILE_SIZE = 16;

export class PlacementPreviewController {
  private placementIndexDirty = true;
  private previewDirty = true;
  private placementIndexedWorld?: ClientWorld;
  private readonly placementSpatial = new Map<number, ClientEntity[]>();
  private readonly placementWorkingCandidates: ClientEntity[] = [];
  private readonly placementCandidateMarkers = new Map<number, number>();
  private placementCandidateMarker = 0;
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
    this.placementSpatial.clear();
    this.placementWorkingCandidates.length = 0;
    this.placementCandidateMarkers.clear();
    this.placementCandidateMarker = 0;
    this.placementIndexDirty = true;
    this.previewDirty = true;
    this.placementIndexedWorld = undefined;
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

    this.ensurePlacementSpatialIndex(world);

    if (
      !this.previewDirty &&
      this.lastComputedWorld === world &&
      this.lastComputedPlayerId === player.id &&
      this.lastComputedPlayerStateVersion === player.stateVersion &&
      this.lastComputedPointerX === pointerAimTarget.x &&
      this.lastComputedPointerY === pointerAimTarget.y &&
      this.lastComputedSelectedItemTypeId === selectedSlot.typeId &&
      this.lastComputedSpatialRevision === this.placementSpatialRevision &&
      this.lastComputedWorldWidth === gameConfig.worldSize.w &&
      this.lastComputedWorldHeight === gameConfig.worldSize.h
    ) {
      this.emitPlacementPreview(renderer, this.lastComputedPreviewState);
      return;
    }

    const snappedX =
      Math.floor(pointerAimTarget.x / STRUCTURE_TILE_SIZE) *
        STRUCTURE_TILE_SIZE +
      STRUCTURE_TILE_SIZE / 2;
    const snappedY =
      Math.floor(pointerAimTarget.y / STRUCTURE_TILE_SIZE) *
        STRUCTURE_TILE_SIZE +
      STRUCTURE_TILE_SIZE / 2;
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

    let valid = true;
    const distanceToPointer = Math.hypot(
      pointerAimTarget.x - player.x,
      pointerAimTarget.y - player.y,
    );
    if (distanceToPointer > BUILD_PLACEMENT_MAX_DISTANCE) {
      valid = false;
    }

    if (
      previewBounds.minX < 0 ||
      previewBounds.minY < 0 ||
      previewBounds.maxX > gameConfig.worldSize.w ||
      previewBounds.maxY > gameConfig.worldSize.h
    ) {
      valid = false;
    }

    if (valid) {
      const candidates = this.queryPlacementCandidates(previewBounds);
      for (const entity of candidates) {
        const entityRects = resolveHitboxRects(
          entity.x,
          entity.y,
          entity.hitboxes,
        );
        if (doResolvedRectSetsOverlap(previewRects, entityRects)) {
          valid = false;
          break;
        }
      }
    }

    const nextPreviewState: PlacementPreviewOutput = {
      visible: true,
      worldX: snappedX,
      worldY: snappedY,
      valid,
      typeId: buildProfile.buildsEntityTypeId,
      hitboxProfiles: buildProfile.hitboxProfiles,
      activeHitboxProfile: buildProfile.activeHitboxProfile,
    };
    this.lastComputedPreviewState = nextPreviewState;
    this.lastComputedWorld = world;
    this.lastComputedPlayerId = player.id;
    this.lastComputedPlayerStateVersion = player.stateVersion;
    this.lastComputedPointerX = pointerAimTarget.x;
    this.lastComputedPointerY = pointerAimTarget.y;
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

  private ensurePlacementSpatialIndex(world: ClientWorld): void {
    if (!this.placementIndexDirty && this.placementIndexedWorld === world) {
      return;
    }

    this.placementSpatial.clear();
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
      const minCellX = Math.floor(bounds.minX / PLACEMENT_SPATIAL_CELL_SIZE);
      const maxCellX = Math.floor(bounds.maxX / PLACEMENT_SPATIAL_CELL_SIZE);
      const minCellY = Math.floor(bounds.minY / PLACEMENT_SPATIAL_CELL_SIZE);
      const maxCellY = Math.floor(bounds.maxY / PLACEMENT_SPATIAL_CELL_SIZE);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = getPlacementCellKey(cellX, cellY);
          let bucket = this.placementSpatial.get(key);
          if (!bucket) {
            bucket = [];
            this.placementSpatial.set(key, bucket);
          }
          bucket.push(entity);
        }
      }
    }

    this.placementIndexDirty = false;
    this.placementIndexedWorld = world;
    this.placementSpatialRevision += 1;
    this.previewDirty = true;
  }

  private queryPlacementCandidates(
    previewBounds: HitboxBounds,
  ): readonly ClientEntity[] {
    this.bumpPlacementCandidateMarker();
    this.placementWorkingCandidates.length = 0;

    const minCellX = Math.floor(
      previewBounds.minX / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const maxCellX = Math.floor(
      previewBounds.maxX / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const minCellY = Math.floor(
      previewBounds.minY / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const maxCellY = Math.floor(
      previewBounds.maxY / PLACEMENT_SPATIAL_CELL_SIZE,
    );

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.placementSpatial.get(
          getPlacementCellKey(cellX, cellY),
        );
        if (!bucket) {
          continue;
        }
        for (const candidate of bucket) {
          if (
            this.placementCandidateMarkers.get(candidate.id) ===
            this.placementCandidateMarker
          ) {
            continue;
          }
          this.placementCandidateMarkers.set(
            candidate.id,
            this.placementCandidateMarker,
          );
          this.placementWorkingCandidates.push(candidate);
        }
      }
    }

    return this.placementWorkingCandidates;
  }

  private bumpPlacementCandidateMarker(): void {
    this.placementCandidateMarker += 1;
    if (this.placementCandidateMarker >= Number.MAX_SAFE_INTEGER) {
      this.placementCandidateMarker = 1;
      this.placementCandidateMarkers.clear();
    }
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

function getPlacementCellKey(cellX: number, cellY: number): number {
  return (
    (cellX + PLACEMENT_KEY_OFFSET) * PLACEMENT_KEY_STRIDE +
    (cellY + PLACEMENT_KEY_OFFSET)
  );
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

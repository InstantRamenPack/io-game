import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import { validateBuildPlacement } from "@shared/gameplay/rules/buildPlacementValidation.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import { isBuildingCtor } from "@server/runtime/ctorGuards.ts";
import type { World } from "@server/world/World.ts";

export function doHitboxesOverlap(
  leftEntity: Entity,
  rightEntity: Entity,
): boolean {
  return doResolvedRectSetsOverlap(
    leftEntity.getWorldHitboxes(),
    rightEntity.getWorldHitboxes(),
  );
}

export function placeStructure(
  player: Player,
  world: World,
  targetX: number,
  targetY: number,
): void {
  const selectedBuildable = player.inventory.getSelectedBuildable();
  const itemTypeId = selectedBuildable?.typeId;
  if (!itemTypeId) {
    return;
  }

  const itemEntry = getItemLikeTypeEntry(itemTypeId);
  const targetEntityTypeId = itemEntry?.content.buildsEntityTypeId;
  if (!targetEntityTypeId) {
    return;
  }

  const targetEntityEntry = entityTypeRegistry.get(targetEntityTypeId);
  if (!targetEntityEntry) {
    return;
  }

  const targetEntityCtor = targetEntityEntry.ctor;
  if (!isBuildingCtor(targetEntityCtor)) {
    return;
  }

  const placedEntity = new targetEntityCtor(world.allocEntityId());
  placedEntity.x = Math.round(targetX);
  placedEntity.y = Math.round(targetY);
  placedEntity.ownerId = player.id;
  const placedBounds = placedEntity.getWorldBounds();
  const blockerHitboxes = world.staticGeometry
    .queryBox(
      placedBounds.minX,
      placedBounds.minY,
      placedBounds.maxX,
      placedBounds.maxY,
    )
    .filter((blocker) => blocker.entityId !== player.id)
    .map((blocker) => blocker.hitboxes);

  const validation = validateBuildPlacement({
    playerX: player.x,
    playerY: player.y,
    targetX,
    targetY,
    maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
    worldWidth: world.gameConfig.worldSize.w,
    worldHeight: world.gameConfig.worldSize.h,
    placementHitboxes: placedEntity.getWorldHitboxes(),
    placementBounds: placedBounds,
    playerHitboxes: player.getWorldHitboxes(),
    blockerHitboxes,
  });
  if (!validation.ok) {
    return;
  }

  if (!player.inventory.consumeSelectedBuildable(1)) {
    return;
  }

  world.spawn(placedEntity);
}

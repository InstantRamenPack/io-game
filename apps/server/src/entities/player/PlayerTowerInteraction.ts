import {
  CRAFTING_STATION_QUERY_RADIUS,
  RECYCLER_INTERACT_PADDING,
  TOWER_INTERACT_PADDING,
} from "@shared/gameplay/constants.ts";
import {
  getRepairableCapability,
  isCraftingStationEntity,
  isRecyclerEntity,
} from "@server/content/serverContentCapabilities.ts";
import { getDebugAdjustedResourceCosts } from "@server/server/debugPlayerBootstrap.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

export function getNearbyCraftingStations(
  player: Player,
  world: World,
): Entity[] {
  return world.spatial
    .queryBox(
      player.x - CRAFTING_STATION_QUERY_RADIUS,
      player.y - CRAFTING_STATION_QUERY_RADIUS,
      player.x + CRAFTING_STATION_QUERY_RADIUS,
      player.y + CRAFTING_STATION_QUERY_RADIUS,
    )
    .filter(isCraftingStationEntity)
    .filter((station) => station.alive);
}

export function isNearRecycler(player: Player, world: World): boolean {
  const bounds = player.getWorldBounds();
  const pad = RECYCLER_INTERACT_PADDING;
  for (const candidate of world.spatial.queryBox(
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX + pad,
    bounds.maxY + pad,
  )) {
    if (!isRecyclerEntity(candidate) || !candidate.alive) {
      continue;
    }
    const rb = candidate.getHitboxBounds();
    if (
      player.x >= candidate.x + rb.minX - pad &&
      player.x <= candidate.x + rb.maxX + pad &&
      player.y >= candidate.y + rb.minY - pad &&
      player.y <= candidate.y + rb.maxY + pad
    ) {
      return true;
    }
  }
  return false;
}

export function repairTower(
  player: Player,
  world: World,
  towerId: number,
): void {
  const tower = world.entities.get(towerId);
  if (!tower) {
    return;
  }
  const repairable = getRepairableCapability(tower);
  if (!repairable) {
    return;
  }

  const missingHp = tower.maxHp - tower.hp;
  if (missingHp <= 0 && tower.alive) {
    return;
  }

  const rb = tower.getHitboxBounds();
  const pad = TOWER_INTERACT_PADDING;
  if (
    player.x < tower.x + rb.minX - pad ||
    player.x > tower.x + rb.maxX + pad ||
    player.y < tower.y + rb.minY - pad ||
    player.y > tower.y + rb.maxY + pad
  ) {
    return;
  }

  const totalMissing = tower.alive ? missingHp : tower.maxHp;
  const repairCost = Math.ceil(totalMissing / repairable.hpPerCostUnit);
  if (repairCost <= 0) {
    return;
  }

  const repairCosts = getDebugAdjustedResourceCosts(player, [
    { typeId: repairable.costItemTypeId, amount: repairCost },
  ]);
  if (!player.inventory.hasTypes(repairCosts)) {
    return;
  }

  player.inventory.consumeTypes(repairCosts);
  tower.hp = tower.maxHp;
  tower.alive = true;
}

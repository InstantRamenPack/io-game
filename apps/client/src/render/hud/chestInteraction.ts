import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { CHEST_INTERACT_PADDING } from "@shared/gameplay/constants.ts";

type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getEntityWorldBounds(entity: ClientEntity): WorldBounds {
  return {
    minX: entity.x + entity.hitboxBounds.minX,
    minY: entity.y + entity.hitboxBounds.minY,
    maxX: entity.x + entity.hitboxBounds.maxX,
    maxY: entity.y + entity.hitboxBounds.maxY,
  };
}

export function isPlayerNearChest(
  player: ClientEntity | undefined,
  chest: ClientEntity,
): boolean {
  if (!player) {
    return false;
  }
  const bounds = getEntityWorldBounds(chest);
  return (
    player.x >= bounds.minX - CHEST_INTERACT_PADDING &&
    player.x <= bounds.maxX + CHEST_INTERACT_PADDING &&
    player.y >= bounds.minY - CHEST_INTERACT_PADDING &&
    player.y <= bounds.maxY + CHEST_INTERACT_PADDING
  );
}

export function findNearestChest(
  player: ClientEntity | undefined,
  chests: ClientEntity[],
): ClientEntity | null {
  if (!player) {
    return null;
  }
  let nearest: ClientEntity | null = null;
  let nearestDistSq = Infinity;
  for (const chest of chests) {
    if (!isPlayerNearChest(player, chest)) {
      continue;
    }
    const dx = chest.x - player.x;
    const dy = chest.y - player.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = chest;
    }
  }
  return nearest;
}

export function findChestAtWorldPoint(
  chests: ClientEntity[],
  worldX: number,
  worldY: number,
): ClientEntity | undefined {
  return chests.find((chest) => {
    const bounds = getEntityWorldBounds(chest);
    return (
      worldX >= bounds.minX &&
      worldX <= bounds.maxX &&
      worldY >= bounds.minY &&
      worldY <= bounds.maxY
    );
  });
}

import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { TOWER_INTERACT_PADDING } from "@shared/gameplay/constants.ts";

const TOWER_TYPE_IDS = new Set([
  "building:energy_tower",
  "building:comms_tower",
]);

export function isTowerDamaged(tower: ClientEntity): boolean {
  return !tower.alive || tower.hp < tower.maxHp;
}

export function isPlayerNearDamagedTower(
  player: ClientEntity,
  tower: ClientEntity,
): boolean {
  if (!isTowerDamaged(tower)) {
    return false;
  }
  const rb = tower.hitboxBounds;
  const pad = TOWER_INTERACT_PADDING;
  return (
    player.x >= tower.x + rb.minX - pad &&
    player.x <= tower.x + rb.maxX + pad &&
    player.y >= tower.y + rb.minY - pad &&
    player.y <= tower.y + rb.maxY + pad
  );
}

export function getTowerRepairCost(tower: ClientEntity): number {
  const missing = tower.alive ? tower.maxHp - tower.hp : tower.maxHp;
  return Math.ceil(missing / 50);
}

export function getNearDamagedTower(
  player: ClientEntity | undefined,
  buildings: ClientEntity[],
): ClientEntity | null {
  if (!player) {
    return null;
  }
  for (const b of buildings) {
    if (!TOWER_TYPE_IDS.has(b.typeId)) {
      continue;
    }
    if (isPlayerNearDamagedTower(player, b)) {
      return b;
    }
  }
  return null;
}

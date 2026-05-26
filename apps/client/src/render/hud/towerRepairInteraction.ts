import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { getEntityCapabilities } from "@shared/content/catalog.ts";
import {
  TOWER_INTERACT_PADDING,
  TOWER_REPAIR_HP_PER_COST_UNIT,
} from "@shared/gameplay/constants.ts";

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
  return Math.ceil(missing / getTowerRepairHpPerCostUnit(tower));
}

export function getNearDamagedTower(
  player: ClientEntity | undefined,
  buildings: ClientEntity[],
): ClientEntity | null {
  if (!player) {
    return null;
  }
  for (const b of buildings) {
    if (!isRepairableTower(b)) {
      continue;
    }
    if (isPlayerNearDamagedTower(player, b)) {
      return b;
    }
  }
  return null;
}

function isRepairableTower(tower: ClientEntity): boolean {
  return getEntityCapabilities(tower.typeId)?.repairable !== undefined;
}

function getTowerRepairHpPerCostUnit(tower: ClientEntity): number {
  return (
    getEntityCapabilities(tower.typeId)?.repairable?.hpPerCostUnit ??
    TOWER_REPAIR_HP_PER_COST_UNIT
  );
}

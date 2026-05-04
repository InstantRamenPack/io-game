import type { ClientEntity } from "@client/net/ClientEntity.ts";

export function isPlayerNearPickup(
  player: ClientEntity,
  pickup: ClientEntity,
): boolean {
  const pb = player.hitboxBounds;
  const pkb = pickup.hitboxBounds;
  return (
    player.x + pb.maxX >= pickup.x + pkb.minX &&
    player.x + pb.minX <= pickup.x + pkb.maxX &&
    player.y + pb.maxY >= pickup.y + pkb.minY &&
    player.y + pb.minY <= pickup.y + pkb.maxY
  );
}

export function getNearestPickup(
  player: ClientEntity | undefined,
  pickups: ClientEntity[],
): ClientEntity | null {
  if (!player) {
    return null;
  }
  let nearest: ClientEntity | null = null;
  let nearestDistSq = Infinity;
  for (const pickup of pickups) {
    if (!isPlayerNearPickup(player, pickup)) {
      continue;
    }
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = pickup;
    }
  }
  return nearest;
}

export function getPickupItemLabel(
  pickup: ClientEntity,
  formatTypeLabel: (typeId: string) => string,
): string {
  const inv = pickup.inventory;
  if (!inv) {
    return "item";
  }
  for (const slot of inv.hotbarSlots) {
    if (slot && slot.kind !== "empty") {
      return formatTypeLabel(slot.typeId);
    }
  }
  if (inv.resources.length > 0 && inv.resources[0]) {
    return formatTypeLabel(inv.resources[0].typeId);
  }
  return "item";
}

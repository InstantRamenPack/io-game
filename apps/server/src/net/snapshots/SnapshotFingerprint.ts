import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  EquippedItemSnapshot,
  InventorySlotSnapshot,
  InventorySnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";

export function getEntitySnapshotFingerprint(snapshot: EntitySnapshot): string {
  const parts = [
    snapshot.id,
    snapshot.kind,
    snapshot.typeId,
    snapshot.x,
    snapshot.y,
    snapshot.vx,
    snapshot.vy,
    snapshot.rotation,
    snapshot.hp,
    snapshot.maxHp,
    snapshot.alive ? 1 : 0,
    snapshot.ownerId ?? "",
    fingerprintHitboxes(snapshot.hitboxes),
  ];

  switch (snapshot.kind) {
    case "player":
      parts.push(
        snapshot.name,
        snapshot.moveSpeed,
        fingerprintInventory(snapshot.inventory),
        fingerprintActiveEffects(snapshot.activeEffects),
        fingerprintEquippedItem(snapshot.equippedItem),
      );
      break;
    case "enemy":
      parts.push(
        snapshot.targetId ?? "",
        fingerprintEquippedItem(snapshot.equippedItem),
      );
      break;
    case "building":
      parts.push(snapshot.label, snapshot.tier);
      break;
    case "pickup":
      parts.push(fingerprintInventory(snapshot.inventory));
      break;
    case "projectile":
      break;
  }

  return parts.join("|");
}

function fingerprintHitboxes(hitboxes: readonly HitboxRect[]): string {
  return hitboxes
    .map((hitbox) =>
      [hitbox.offsetX, hitbox.offsetY, hitbox.width, hitbox.height].join(","),
    )
    .join(";");
}

function fingerprintInventory(inventory: InventorySnapshot): string {
  return [
    inventory.selectedHotbarIndex,
    inventory.resources
      .map((resource) => `${resource.typeId}:${resource.amount}`)
      .join(";"),
    inventory.hotbarSlots.map(fingerprintInventorySlot).join(";"),
  ].join("|");
}

function fingerprintInventorySlot(slot: InventorySlotSnapshot): string {
  if (slot.kind === "empty") {
    return "empty";
  }
  if (slot.kind === "buildable") {
    return `buildable:${slot.typeId}:${slot.count}`;
  }
  return `weapon:${fingerprintWeapon(slot)}`;
}

function fingerprintWeapon(weapon: WeaponSnapshot): string {
  return [
    weapon.typeId,
    weapon.ownerId ?? "",
    weapon.cooldownTicksRemaining,
    weapon.ammoInMag ?? "",
    weapon.magSize ?? "",
    weapon.reserveMagCount ?? "",
    weapon.reloadTicks ?? "",
    weapon.reloadTicksRemaining ?? "",
  ].join(",");
}

function fingerprintActiveEffects(
  activeEffects: readonly ActiveEffectSnapshot[],
): string {
  return activeEffects
    .map((effect) => `${effect.typeId}:${effect.ticksRemaining}`)
    .join(";");
}

function fingerprintEquippedItem(
  equippedItem: EquippedItemSnapshot | undefined,
): string {
  if (!equippedItem) {
    return "";
  }

  return [
    equippedItem.typeId,
    equippedItem.attackStyle,
    equippedItem.cooldownTicksRemaining,
    equippedItem.ammoInMag ?? "",
    equippedItem.magSize ?? "",
    equippedItem.reserveMagCount ?? "",
    equippedItem.reloadTicks ?? "",
    equippedItem.reloadTicksRemaining ?? "",
  ].join(",");
}

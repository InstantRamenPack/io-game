import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  EquippedItemSnapshot,
  InventorySlotSnapshot,
  InventorySnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Building } from "@server/entities/Building.ts";
import type { ChestSlot } from "@server/entities/buildings/Chest.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";

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
      parts.push(
        snapshot.label,
        snapshot.tier,
        fingerprintOptionalChestSlots(snapshot.chestSlots),
      );
      break;
    case "pickup":
      parts.push(fingerprintInventory(snapshot.inventory));
      break;
    case "projectile":
      break;
  }

  return parts.join("|");
}

export function getEntityRuntimeFingerprint(entity: Entity): string {
  const ctor = entity.constructor as typeof Entity & { readonly kind?: string };
  const parts: Array<number | string> = [
    entity.id,
    ctor.kind ?? entity.constructor.name,
    entity.typeId,
    entity.x,
    entity.y,
    entity.vx,
    entity.vy,
    entity.rotation,
    entity.hp,
    entity.maxHp,
    entity.alive ? 1 : 0,
    entity.ownerId ?? "",
    fingerprintHitboxes(entity.hitboxes),
  ];

  if (entity instanceof Player) {
    parts.push(
      entity.name,
      entity.moveSpeed,
      fingerprintInventoryRuntime(entity.inventory, entity),
      fingerprintActiveEffectsRuntime(entity.activeEffects),
      fingerprintEquippedWeaponRuntime(entity.getActiveWeapon(), entity),
    );
    return parts.join("|");
  }

  if (entity instanceof Enemy) {
    parts.push(
      entity.targetId ?? "",
      fingerprintEquippedWeaponRuntime(entity.weapons[0], entity),
    );
    return parts.join("|");
  }

  if (entity instanceof Building) {
    parts.push(
      entity.label,
      entity.tier,
      fingerprintChestSlotsRuntime(
        "chestSlots" in entity
          ? ((entity as { chestSlots?: readonly ChestSlot[] }).chestSlots ??
              undefined)
          : undefined,
      ),
    );
    return parts.join("|");
  }

  if (entity instanceof ItemEntity) {
    parts.push(fingerprintInventoryRuntime(entity.contents));
    return parts.join("|");
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
    inventory.unlockedRecipeTypeIds.join(";"),
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

function fingerprintInventorySlotRuntime(
  slot:
    | { kind: "buildable"; typeId: string; count: number }
    | { kind: "weapon"; weapon: Weapon }
    | null
    | undefined,
  owner: Entity | undefined,
): string {
  if (!slot) {
    return "empty";
  }
  if (slot.kind === "buildable") {
    return `buildable:${slot.typeId}:${slot.count}`;
  }
  return `weapon:${fingerprintWeaponRuntime(slot.weapon, owner)}`;
}

function fingerprintOptionalChestSlots(
  chestSlots: readonly InventorySlotSnapshot[] | undefined,
): string {
  if (!chestSlots) {
    return "";
  }
  return chestSlots.map(fingerprintInventorySlot).join(";");
}

function fingerprintChestSlotsRuntime(
  chestSlots: readonly ChestSlot[] | undefined,
): string {
  if (!chestSlots) {
    return "";
  }
  return chestSlots
    .map((slot) => {
      if (!slot) {
        return "empty";
      }
      if (slot.kind === "buildable") {
        return `buildable:${slot.typeId}:${slot.count}`;
      }
      return `weapon:${fingerprintWeapon({ typeId: slot.typeId } as WeaponSnapshot)}`;
    })
    .join(";");
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

function fingerprintWeaponRuntime(
  weapon: Weapon,
  owner: Entity | undefined,
): string {
  const snapshot = weapon.toSnapshot();
  return [
    snapshot.typeId,
    snapshot.ownerId ?? "",
    snapshot.cooldownTicksRemaining,
    snapshot.ammoInMag ?? "",
    snapshot.magSize ?? "",
    weapon.getReserveMagCount(owner) ?? "",
    snapshot.reloadTicks ?? "",
    snapshot.reloadTicksRemaining ?? "",
  ].join(",");
}

function fingerprintActiveEffects(
  activeEffects: readonly ActiveEffectSnapshot[],
): string {
  return activeEffects
    .map(
      (effect) =>
        `${effect.typeId}:${effect.ticksRemaining}:${effect.preventsAction ? 1 : 0}:${effect.speedMultiplier ?? ""}`,
    )
    .join(";");
}

function fingerprintActiveEffectsRuntime(
  activeEffects: readonly {
    typeId: string;
    ticksRemaining: number;
    preventsAction?: boolean;
    speedMultiplier?: number;
  }[],
): string {
  return activeEffects
    .map(
      (effect) =>
        `${effect.typeId}:${effect.ticksRemaining}:${effect.preventsAction ? 1 : 0}:${effect.speedMultiplier ?? ""}`,
    )
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

function fingerprintEquippedWeaponRuntime(
  weapon: Weapon | undefined,
  owner: Entity | undefined,
): string {
  if (!weapon) {
    return "";
  }
  const equippedItem = weapon.toEquippedItemSnapshot(owner);
  return fingerprintEquippedItem(equippedItem);
}

function fingerprintInventoryRuntime(
  inventory: Inventory,
  owner?: Entity,
): string {
  const resourceEntries = [...inventory.resources.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([leftTypeId], [rightTypeId]) =>
      leftTypeId.localeCompare(rightTypeId),
    )
    .map(([typeId, amount]) => `${typeId}:${amount}`);

  return [
    inventory.selectedHotbarIndex,
    resourceEntries.join(";"),
    inventory.hotbarSlots
      .map((slot) => fingerprintInventorySlotRuntime(slot, owner))
      .join(";"),
    inventory.getUnlockedRecipeTypeIds().join(";"),
  ].join("|");
}

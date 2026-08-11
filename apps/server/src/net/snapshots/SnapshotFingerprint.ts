import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  InventorySlotSnapshot,
  InventorySnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";
import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import {
  getEntitySnapshotBaseFingerprintParts,
  getEquippedItemSnapshotFingerprint,
  getHitboxFingerprint,
} from "@server/net/snapshots/EntitySnapshotDescriptor.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Building } from "@server/entities/Building.ts";
import type { ContainerSlot } from "@server/inventory/ContainerSlot.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Structure } from "@server/entities/Structure.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";

export type RuntimeFingerprintPart = string | number | null;
const hitboxFingerprintCache = new WeakMap<readonly HitboxRect[], string>();
const ROTATION_SCALE = 65535 / (Math.PI * 2);

export function getEntitySnapshotFingerprint(snapshot: EntitySnapshot): string {
  const parts = getEntitySnapshotBaseFingerprintParts(snapshot);

  switch (snapshot.kind) {
    case "player":
      parts.push(
        snapshot.name,
        snapshot.moveSpeed,
        fingerprintInventory(snapshot.inventory),
        fingerprintActiveEffects(snapshot.activeEffects),
        getEquippedItemSnapshotFingerprint(snapshot.equippedItem),
        snapshot.armorTypeId ?? "",
      );
      break;
    case "enemy":
      parts.push(
        snapshot.targetId ?? "",
        fingerprintActiveEffects(snapshot.activeEffects ?? []),
        getEquippedItemSnapshotFingerprint(snapshot.equippedItem),
      );
      break;
    case "building":
    case "tower":
      parts.push(
        snapshot.label,
        snapshot.tier,
        fingerprintOptionalChestSlots(snapshot.chestSlots),
      );
      break;
    case "structure":
      parts.push(snapshot.label);
      break;
    case "pickup":
      parts.push(fingerprintInventory(snapshot.inventory));
      break;
    case "projectile":
      break;
  }

  return parts.join("|");
}

export function getEntityRuntimeFingerprint(
  entity: Entity,
  hitboxFingerprint: string = getEntityHitboxFingerprint(entity),
  parts: RuntimeFingerprintPart[] = [],
): RuntimeFingerprintPart[] {
  parts.length = 0;
  const ctor = entity.constructor as typeof Entity & {
    readonly kind?: string;
  };
  parts.push(
    entity.id,
    ctor.kind ?? entity.constructor.name,
    entity.typeId,
    quantizeTenth(entity.x),
    quantizeTenth(entity.y),
    quantizeTenth(entity.vx),
    quantizeTenth(entity.vy),
    Math.round(normalizeAngle(entity.rotation) * ROTATION_SCALE) & 0xffff,
    entity.hp,
    entity.maxHp,
    entity.alive ? 1 : 0,
    entity.ownerId ?? null,
  );
  parts.push(hitboxFingerprint);

  if (entity instanceof Player) {
    parts.push(entity.name, quantizeTenth(entity.moveSpeed));
    appendInventoryRuntime(parts, entity.inventory, entity);
    appendActiveEffectsRuntime(parts, entity.activeEffects);
    appendEquippedWeaponRuntime(parts, entity.getActiveWeapon(), entity);
    parts.push(entity.getEquippedArmorTypeId() ?? null);
    return parts;
  }

  if (entity instanceof Enemy) {
    parts.push(entity.targetId ?? null);
    appendActiveEffectsRuntime(parts, entity.activeEffects);
    appendEquippedWeaponRuntime(parts, entity.weapons[0], entity);
    return parts;
  }

  if (entity instanceof Building) {
    parts.push(entity.label, entity.tier);
    appendChestSlotsRuntime(
      parts,
      "chestSlots" in entity
        ? ((entity as { chestSlots?: readonly ContainerSlot[] }).chestSlots ??
            undefined)
        : undefined,
    );
    return parts;
  }

  if (entity instanceof Structure) {
    parts.push(entity.label);
    return parts;
  }

  if (entity instanceof ItemEntity) {
    appendInventoryRuntime(parts, entity.contents);
    return parts;
  }

  return parts;
}

export function getEntityHitboxFingerprint(entity: Entity): string {
  const hitboxes = entity.hitboxes;
  let fingerprint = hitboxFingerprintCache.get(hitboxes);
  if (fingerprint === undefined) {
    fingerprint = getHitboxFingerprint(hitboxes);
    hitboxFingerprintCache.set(hitboxes, fingerprint);
  }
  return fingerprint;
}

export function runtimeFingerprintsMatch(
  left: readonly RuntimeFingerprintPart[] | undefined,
  right: readonly RuntimeFingerprintPart[],
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
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

function fingerprintOptionalChestSlots(
  chestSlots: readonly InventorySlotSnapshot[] | undefined,
): string {
  if (!chestSlots) {
    return "";
  }
  return chestSlots.map(fingerprintInventorySlot).join(";");
}

function appendChestSlotsRuntime(
  parts: RuntimeFingerprintPart[],
  chestSlots: readonly ContainerSlot[] | undefined,
): void {
  if (!chestSlots) {
    parts.push(0);
    return;
  }
  parts.push(chestSlots.length);
  for (const slot of chestSlots) {
    if (!slot) {
      parts.push(0);
    } else if (slot.kind === "buildable") {
      parts.push(1, slot.typeId, slot.count);
    } else {
      parts.push(2, slot.typeId);
    }
  }
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

function appendWeaponRuntime(
  parts: RuntimeFingerprintPart[],
  weapon: Weapon,
  owner: Entity | undefined,
): void {
  const snapshot = weapon.toSnapshot();
  parts.push(
    snapshot.typeId,
    snapshot.ownerId ?? null,
    snapshot.cooldownTicksRemaining ?? null,
    snapshot.ammoInMag ?? null,
    snapshot.magSize ?? null,
    weapon.getReserveMagCount(owner) ?? null,
    snapshot.reloadTicks ?? null,
    snapshot.reloadTicksRemaining ?? null,
  );
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

function appendActiveEffectsRuntime(
  parts: RuntimeFingerprintPart[],
  activeEffects: readonly {
    typeId: string;
    ticksRemaining: number;
    preventsAction?: boolean;
    speedMultiplier?: number;
  }[],
): void {
  parts.push(activeEffects.length);
  for (const effect of activeEffects) {
    parts.push(
      effect.typeId,
      effect.ticksRemaining,
      effect.preventsAction ? 1 : 0,
      effect.speedMultiplier === undefined
        ? null
        : quantizeTenth(effect.speedMultiplier),
    );
  }
}

function quantizeTenth(value: number): number {
  return Math.round(value * 10);
}

function appendEquippedWeaponRuntime(
  parts: RuntimeFingerprintPart[],
  weapon: Weapon | undefined,
  owner: Entity | undefined,
): void {
  if (!weapon) {
    parts.push(0);
    return;
  }
  const equippedItem = weapon.toEquippedItemSnapshot(owner);
  parts.push(
    1,
    equippedItem.typeId,
    equippedItem.attackStyle,
    equippedItem.cooldownTicksRemaining,
    equippedItem.ammoInMag ?? null,
    equippedItem.magSize ?? null,
    equippedItem.reserveMagCount ?? null,
    equippedItem.reloadTicks ?? null,
    equippedItem.reloadTicksRemaining ?? null,
  );
}

function appendInventoryRuntime(
  parts: RuntimeFingerprintPart[],
  inventory: Inventory,
  owner?: Entity,
): void {
  parts.push(inventory.selectedHotbarIndex);
  const resourceCountIndex = parts.length;
  parts.push(0);
  let resourceCount = 0;
  for (const [typeId, amount] of inventory.resources) {
    if (amount <= 0) {
      continue;
    }
    parts.push(typeId, amount);
    resourceCount += 1;
  }
  parts[resourceCountIndex] = resourceCount;

  parts.push(inventory.hotbarSlots.length);
  for (const slot of inventory.hotbarSlots) {
    if (!slot) {
      parts.push(0);
    } else if (slot.kind === "buildable") {
      parts.push(1, slot.typeId, slot.count);
    } else {
      parts.push(2);
      appendWeaponRuntime(parts, slot.weapon, owner);
    }
  }

  const unlockedRecipeTypeIds = inventory.getUnlockedRecipeTypeIds();
  parts.push(unlockedRecipeTypeIds.length);
  for (const typeId of unlockedRecipeTypeIds) {
    parts.push(typeId);
  }
}

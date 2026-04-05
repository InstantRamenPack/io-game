import { requireWeaponContent } from "@shared/content/catalog.ts";
import type {
  JabWeaponContent,
  ShootWeaponContent,
  SwingWeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Effect } from "@server/effects/Effect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";

export function requireShootWeaponContent(
  typeId: ResourceId,
): ShootWeaponContent {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle !== "shoot") {
    throw new Error(`Expected shoot weapon content for ${typeId}.`);
  }
  return weaponContent;
}

export function requireSwingWeaponContent(
  typeId: ResourceId,
): SwingWeaponContent {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle !== "swing") {
    throw new Error(`Expected swing weapon content for ${typeId}.`);
  }
  return weaponContent;
}

export function requireJabWeaponContent(typeId: ResourceId): JabWeaponContent {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle !== "jab") {
    throw new Error(`Expected jab weapon content for ${typeId}.`);
  }
  return weaponContent;
}

export function createStandardMeleeHitEffects(
  typeId: ResourceId,
  extraEffects: Effect[] = [],
): Effect[] {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle === "shoot") {
    throw new Error(`Expected melee weapon content for ${typeId}.`);
  }

  const hitEffects: Effect[] = [];
  if (weaponContent.damage > 0) {
    hitEffects.push(new DamageEffect(weaponContent.damage));
  }
  if (weaponContent.knockback > 0) {
    hitEffects.push(new KnockbackEffect(weaponContent.knockback));
  }
  hitEffects.push(...extraEffects);
  return hitEffects;
}

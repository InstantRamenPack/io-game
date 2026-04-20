import { requireWeaponContent } from "@shared/content/catalog.ts";
import type {
  JabWeaponContent,
  WeaponContent,
  ShootWeaponContent,
  SwingWeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Effect } from "@server/effects/Effect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";

function requireWeaponContentOfStyle<
  TAttackStyle extends WeaponContent["attackStyle"],
>(
  typeId: ResourceId,
  attackStyle: TAttackStyle,
): Extract<WeaponContent, { attackStyle: TAttackStyle }> {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle !== attackStyle) {
    throw new Error(`Expected ${attackStyle} weapon content for ${typeId}.`);
  }
  return weaponContent as Extract<WeaponContent, { attackStyle: TAttackStyle }>;
}

export function requireShootWeaponContent(
  typeId: ResourceId,
): ShootWeaponContent {
  return requireWeaponContentOfStyle(typeId, "shoot");
}

export function requireSwingWeaponContent(
  typeId: ResourceId,
): SwingWeaponContent {
  return requireWeaponContentOfStyle(typeId, "swing");
}

export function requireJabWeaponContent(typeId: ResourceId): JabWeaponContent {
  return requireWeaponContentOfStyle(typeId, "jab");
}

function requireMeleeWeaponContent(
  typeId: ResourceId,
): SwingWeaponContent | JabWeaponContent {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle === "shoot") {
    throw new Error(`Expected melee weapon content for ${typeId}.`);
  }
  return weaponContent;
}

export function createStandardMeleeHitEffects(
  typeId: ResourceId,
  extraEffects: Effect[] = [],
): Effect[] {
  const weaponContent = requireMeleeWeaponContent(typeId);

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

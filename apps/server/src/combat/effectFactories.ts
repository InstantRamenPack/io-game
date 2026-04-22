import type {
  JabWeaponContent,
  ProjectileContent,
  SwingWeaponContent,
} from "@shared/content/schema.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import type { Effect } from "@server/effects/Effect.ts";

export function createProjectileHitEffects(
  projectileContent: ProjectileContent,
  extraHitEffects: readonly Effect[] = [],
): Effect[] {
  const hitEffects: Effect[] = [];
  if (projectileContent.damage > 0) {
    hitEffects.push(new DamageEffect(projectileContent.damage));
  }
  hitEffects.push(...extraHitEffects);
  return hitEffects;
}

export function createMeleeWeaponHitEffects(
  weaponContent: SwingWeaponContent | JabWeaponContent,
  extraEffects: readonly Effect[] = [],
): Effect[] {
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

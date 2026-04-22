import {
  requireProjectileContent,
  requireWeaponContent,
} from "@shared/content/catalog.ts";
import type {
  JabWeaponContent,
  ShootWeaponContent,
  SwingWeaponContent,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import type { ProjectileDefinition } from "@server/entities/Projectile.ts";
import type { Effect } from "@server/effects/Effect.ts";
import {
  createMeleeWeaponHitEffects,
  createProjectileHitEffects,
} from "@server/combat/effectFactories.ts";

export function requireWeaponContentOfStyle<
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

export function requireShootWeaponRuntime(
  typeId: ResourceId,
): ShootWeaponContent {
  return requireWeaponContentOfStyle(typeId, "shoot");
}

export function requireSwingWeaponRuntime(
  typeId: ResourceId,
): SwingWeaponContent {
  return requireWeaponContentOfStyle(typeId, "swing");
}

export function requireJabWeaponRuntime(typeId: ResourceId): JabWeaponContent {
  return requireWeaponContentOfStyle(typeId, "jab");
}

function requireMeleeWeaponRuntime(
  typeId: ResourceId,
): SwingWeaponContent | JabWeaponContent {
  const weaponContent = requireWeaponContent(typeId);
  if (weaponContent.attackStyle === "shoot") {
    throw new Error(`Expected melee weapon content for ${typeId}.`);
  }
  return weaponContent;
}

export function createMeleeHitEffectsForWeapon(
  typeId: ResourceId,
  extraEffects: readonly Effect[] = [],
): Effect[] {
  return createMeleeWeaponHitEffects(
    requireMeleeWeaponRuntime(typeId),
    extraEffects,
  );
}

export function createProjectileDefinitionForType(
  typeId: ResourceId,
  extraHitEffects: readonly Effect[] = [],
): ProjectileDefinition {
  const projectileContent = requireProjectileContent(typeId);
  return {
    speed: projectileContent.speed,
    range: projectileContent.range,
    hitboxes: [
      makeHitboxRect(
        projectileContent.hitbox.width,
        projectileContent.hitbox.height,
      ),
    ],
    maxHits: projectileContent.maxHits ?? 1,
    hitEffects: createProjectileHitEffects(projectileContent, extraHitEffects),
  };
}

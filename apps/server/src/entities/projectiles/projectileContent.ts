import { requireProjectileContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { ProjectileDefinition } from "@server/entities/Projectile.ts";

export function makeProjectileDefinition(
  typeId: ResourceId,
  extraHitEffects: readonly Effect[] = [],
): ProjectileDefinition {
  const projectileContent = requireProjectileContent(typeId);
  const hitEffects: Effect[] = [];
  if (projectileContent.damage > 0) {
    hitEffects.push(new DamageEffect(projectileContent.damage));
  }
  hitEffects.push(...extraHitEffects);

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
    hitEffects,
  };
}

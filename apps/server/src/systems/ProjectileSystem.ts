import { Projectile } from "@server/entities/projectiles/Projectile.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

/**
 * Advances projectile post-step hit and lifetime rules after movement and broad-phase rebuild.
 */
export class ProjectileSystem implements System {
  update(world: World): void {
    for (const projectile of world.entities.all()) {
      if (!(projectile instanceof Projectile)) {
        continue;
      }

      if (projectile.resolvePostStep(world)) {
        world.despawn(projectile.id);
      }
    }
  }
}

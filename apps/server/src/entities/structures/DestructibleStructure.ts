import { Structure } from "@server/entities/Structure.ts";
import type { World } from "@server/world/World.ts";

/**
 * Map structures that can be destroyed and despawned when their HP reaches zero.
 */
export class DestructibleStructure extends Structure {
  public override handleDeath(world: World): void {
    this.alive = false;
    world.despawn(this.id);
  }
}

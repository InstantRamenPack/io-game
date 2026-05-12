import { Enemy } from "@server/entities/Enemy.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { World } from "@server/world/World.ts";

export class Crate extends Enemy {
  public static override readonly resourceName = "crate";
  public readonly contents = new Inventory();

  constructor(id: number) {
    super(id, {});
  }

  public override handleDeath(world: World): void {
    this.alive = false;

    if (!this.hasContents()) {
      world.despawn(this.id);
      return;
    }

    const pickup = new ItemEntity(world.allocEntityId(), this.contents);
    pickup.x = this.x;
    pickup.y = this.y;
    world.despawn(this.id);
    world.spawn(pickup);
  }

  private hasContents(): boolean {
    if (this.contents.resources.size > 0) {
      return true;
    }
    if (this.contents.hotbarSlots.some((slot) => slot !== null)) {
      return true;
    }
    return this.contents.getUnlockedRecipeTypeIds().length > 0;
  }
}

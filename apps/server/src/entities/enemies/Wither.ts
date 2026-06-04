import { Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { WitherCardinalBeamGoal } from "@server/goals/builtin/WitherCardinalBeamGoal.ts";
import { WitherRotatingBeamGoal } from "@server/goals/builtin/WitherRotatingBeamGoal.ts";
import { WitherAirstrikeGoal } from "@server/goals/builtin/WitherAirstrikeGoal.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { requireItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import {
  getEnemyDeathLootConfig,
  getEnemyDeathHunkDropAmount,
  HUNK_ITEM_TYPE_ID,
} from "@server/content/serverContentCapabilities.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Wither extends Enemy {
  public static override readonly resourceName = "wither";

  constructor(id: number) {
    super(id, {
      goals: [
        ...createCombatTargetGoals(0, 1470),
        new LookAtTargetGoal<Enemy>(1),
        // Airstrike — room-wide explosion spread (highest attack priority)
        new WitherAirstrikeGoal<Enemy>(2),
        // Rotating beams + targeting players
        new WitherRotatingBeamGoal<Enemy>(3),
        // Cardinal beams in all 4 directions
        new WitherCardinalBeamGoal<Enemy>(4),
        // Chase when out of range
        new GoToTargetGoal<Enemy>(5, 90),
      ],
    });
  }

  public override handleDeath(world: World): void {
    // Always drop the Streaker
    const streakerEntry = requireItemLikeTypeEntry(
      "item:streaker" as ResourceId,
    );
    if (streakerEntry) {
      const streakerInventory = new Inventory();
      streakerInventory.grantItemCtor(streakerEntry.ctor, 1);
      const streakerPickup = new ItemEntity(
        world.allocEntityId(),
        streakerInventory,
      );
      streakerPickup.x = this.x;
      streakerPickup.y = this.y;
      world.spawn(streakerPickup);
    }

    // Drop hunk (legendary tier)
    const lootConfig = getEnemyDeathLootConfig(this.typeId);
    const hunkInventory = new Inventory();
    hunkInventory.addStackable(
      HUNK_ITEM_TYPE_ID,
      getEnemyDeathHunkDropAmount(
        lootConfig.rarityTier,
        world.randomNumberGenerator,
      ),
    );
    const hunkPickup = new ItemEntity(world.allocEntityId(), hunkInventory);
    hunkPickup.x = this.x + 30;
    hunkPickup.y = this.y;
    world.spawn(hunkPickup);

    this.alive = false;
    world.despawn(this.id);
  }
}

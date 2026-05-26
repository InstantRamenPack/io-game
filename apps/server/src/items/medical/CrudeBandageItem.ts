import type { Player } from "@server/entities/Player.ts";
import { HealEffect } from "@server/effects/builtin/HealEffect.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";
import { getItemContent } from "@shared/content/catalog.ts";
import type { World } from "@server/world/World.ts";

export class CrudeBandageItem extends ConsumableItem {
  public static override readonly resourceName = "crude_bandage";

  public override requiresManualPickup(): boolean {
    return true;
  }

  public consume(world: World, player: Player): void {
    const amount = getItemContent(this.typeId)?.healing?.amount;
    if (amount === undefined) {
      return;
    }
    new HealEffect(amount).apply(world, player, player);
  }
}

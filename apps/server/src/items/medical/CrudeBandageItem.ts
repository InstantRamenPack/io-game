import type { Player } from "@server/entities/Player.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";
import { getItemContent } from "@shared/content/catalog.ts";

export class CrudeBandageItem extends ConsumableItem {
  public static override readonly resourceName = "crude_bandage";

  public consume(player: Player): void {
    const healAmount = getItemContent(this.typeId)?.food?.healAmount;
    if (healAmount === undefined) {
      return;
    }
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
  }
}

import type { Player } from "@server/entities/Player.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";
import { getItemContent } from "@shared/content/catalog.ts";

export class SpeedPotionItem extends ConsumableItem {
  public static override readonly resourceName = "speed_potion";

  public consume(player: Player): void {
    const activeEffect = getItemContent(this.typeId)?.activeEffect;
    if (!activeEffect) {
      return;
    }
    player.applyOrRefreshActiveEffect({
      typeId: activeEffect.typeId,
      ticksRemaining: activeEffect.durationTicks,
      speedMultiplier: activeEffect.speedMultiplier,
    });
  }
}

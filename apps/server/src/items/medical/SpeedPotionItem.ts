import type { Player } from "@server/entities/Player.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";

const SPEED_BOOST_EFFECT_TYPE_ID = "effect:speed_boost" as const;
const SPEED_BOOST_DURATION_TICKS = 60 * 20 * 3;
const SPEED_BOOST_MULTIPLIER = 1.35;

export class SpeedPotionItem extends ConsumableItem {
  public static override readonly resourceName = "speed_potion";

  public consume(player: Player): void {
    player.applyOrRefreshActiveEffect({
      typeId: SPEED_BOOST_EFFECT_TYPE_ID,
      ticksRemaining: SPEED_BOOST_DURATION_TICKS,
      speedMultiplier: SPEED_BOOST_MULTIPLIER,
    });
  }
}

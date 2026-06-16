import type { Player } from "@server/entities/Player.ts";
import type { Effect } from "@server/effects/Effect.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";
import { requireGameTypeEntry } from "@server/registry/registries.ts";
import { getItemContent } from "@shared/content/catalog.ts";
import type { World } from "@server/world/World.ts";

type TimedEffectCtor = new (durationTicks: number) => Effect;

export class SpeedPotionItem extends ConsumableItem {
  public static override readonly resourceName = "speed_potion";

  public consume(world: World, player: Player): void {
    const activeEffect = getItemContent(this.typeId)?.activeEffect;
    if (!activeEffect) {
      return;
    }
    const EffectCtor = requireGameTypeEntry(activeEffect.typeId, "effect")
      .ctor as unknown as TimedEffectCtor;
    new EffectCtor(activeEffect.durationTicks).apply(world, player, player);
  }
}

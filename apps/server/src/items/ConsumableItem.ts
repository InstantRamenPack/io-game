import type { Player } from "@server/entities/Player.ts";
import { Item } from "@server/items/Item.ts";

export abstract class ConsumableItem extends Item {
  public abstract consume(player: Player): void;
}

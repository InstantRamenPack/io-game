import type { Player } from "@server/entities/Player.ts";
import { Item } from "@server/items/Item.ts";
import type { World } from "@server/world/World.ts";

export abstract class ConsumableItem extends Item {
  public abstract consume(world: World, player: Player): void;
}

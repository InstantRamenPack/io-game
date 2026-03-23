import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";

export { ItemEntity } from "@server/entities/ItemEntity.ts";
export { Player } from "@server/entities/Player.ts";

export const coreEntityTypes = [Player, ItemEntity] as const;

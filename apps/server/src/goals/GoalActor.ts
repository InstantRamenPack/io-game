import type { Entity } from "@server/entities/Entity.ts";
import type { Weapon } from "@server/items/Weapon.ts";

export interface GoalActor extends Entity {
  moveSpeed: number;
  speed?: number;
  targetId?: number;
  weapons: Weapon[];
}

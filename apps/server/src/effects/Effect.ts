import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

/**
 * Base gameplay effect for lightweight server-authoritative status hooks.
 */
export abstract class Effect {
  readonly id: string;
  readonly label: string;

  protected constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }

  abstract apply(world: World, source: Entity, target: Entity): void;
}

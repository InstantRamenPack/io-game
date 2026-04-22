import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Base gameplay effect for lightweight server-authoritative status hooks.
 */
export abstract class Effect {
  public static readonly kind = "effect" as const;
  public static readonly resourceName: string = "";

  public static get typeId(): ResourceId {
    return makeResourceId(this.kind, this.resourceName);
  }

  public readonly typeId: ResourceId;
  public readonly label: string;

  protected constructor() {
    const EffectCtor = this.constructor as typeof Effect;
    this.typeId = EffectCtor.typeId;
    this.label = requireEffectContent(this.typeId).label;
  }

  public abstract apply(world: World, source: Entity, target: Entity): void;
}

import type {
  EffectContent,
  EntityContent,
  EntityKind,
  ItemContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type {
  Projectile,
  ProjectileDefinition,
  ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { Item } from "@server/items/Item.ts";

type RuntimeTypeMetadata<KKind extends string> = {
  readonly kind: KKind;
  readonly resourceName: string;
  readonly typeId: ResourceId;
};

export type EntityCtor<T extends Entity = Entity> = new (...args: never[]) => T;
export type ItemCtor<T extends Item = Item> = new () => T;
export type EffectCtor<T extends Effect = Effect> = new (...args: never[]) => T;
export type ProjectileCtor<T extends Projectile = Projectile> = new (
  id: number,
  config: ProjectileSpawnConfig,
) => T;

export type RegistrableEntityCtor<T extends Entity = Entity> = EntityCtor<T> &
  RuntimeTypeMetadata<EntityKind>;
export type RegistrableItemCtor<T extends Item = Item> = ItemCtor<T> &
  RuntimeTypeMetadata<"item">;
export type RegistrableEffectCtor<T extends Effect = Effect> = EffectCtor<T> &
  RuntimeTypeMetadata<"effect">;
export type RegistrableProjectileCtor<T extends Projectile = Projectile> =
  RegistrableEntityCtor<T> &
    ProjectileCtor<T> & {
      readonly definition: ProjectileDefinition;
    };

export type EntityTypeEntry = {
  typeId: ResourceId;
  kind: EntityKind;
  content: EntityContent;
  ctor: RegistrableEntityCtor;
};

export type ItemTypeEntry = {
  typeId: ResourceId;
  content: ItemContent;
  ctor: RegistrableItemCtor;
};

export type EffectTypeEntry = {
  typeId: ResourceId;
  content: EffectContent;
  ctor: RegistrableEffectCtor;
};

export const entityTypeRegistry = new TypeRegistry<EntityTypeEntry>();
export const itemTypeRegistry = new TypeRegistry<ItemTypeEntry>();
export const effectTypeRegistry = new TypeRegistry<EffectTypeEntry>();

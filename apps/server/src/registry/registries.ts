import type {
  EntityContent,
  EntityKind,
  ItemContent,
  ItemRecipeContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type {
  Projectile,
  ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { Item } from "@server/items/Item.ts";
import type {
  EntityClassMetadata,
  ItemClassMetadata,
} from "@server/registry/typeMetadata.ts";

export type EntityCtor<T extends Entity = Entity> = new (...args: never[]) => T;
export type ItemCtor<T extends Item = Item> = new (id: number) => T;
export type ProjectileCtor<T extends Projectile = Projectile> = new (
  id: number,
  config: ProjectileSpawnConfig,
) => T;

export type RegistrableEntityCtor<T extends Entity = Entity> = EntityCtor<T> &
  EntityClassMetadata & {
    readonly typeId: ResourceId;
  };
export type RegistrableItemCtor<T extends Item = Item> = ItemCtor<T> &
  ItemClassMetadata & {
    readonly typeId: ResourceId;
  };
export type RegistrableProjectileCtor<T extends Projectile = Projectile> =
  ProjectileCtor<T> & {
    readonly kind: "projectile";
    readonly resourceName: string;
    readonly typeId: ResourceId;
  };

export type EntityTypeEntry = {
  typeId: ResourceId;
  kind: EntityKind;
  resourceName: string;
  label: string;
  content: EntityContent;
  ctor: RegistrableEntityCtor;
};

export type ItemTypeEntry = {
  typeId: ResourceId;
  kind: "item";
  resourceName: string;
  label: string;
  stackMax: number;
  buildingTypeId?: ResourceId;
  content: ItemContent;
  recipe?: ItemRecipeContent;
  ctor: RegistrableItemCtor;
};

export const entityTypeRegistry = new TypeRegistry<EntityTypeEntry>();
export const itemTypeRegistry = new TypeRegistry<ItemTypeEntry>();
export const projectileTypeRegistry =
  new TypeRegistry<RegistrableProjectileCtor>();

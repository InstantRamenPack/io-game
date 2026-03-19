import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type {
  Projectile,
  ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { Item } from "@server/items/Item.ts";

export type EntityCtor<T extends Entity = Entity> = new (...args: never[]) => T;
export type ItemCtor<T extends Item = Item> = new (...args: never[]) => T;
export type ProjectileCtor<T extends Projectile = Projectile> = new (
  id: number,
  config: ProjectileSpawnConfig,
) => T;

export type RegistrableEntityCtor<T extends Entity = Entity> = EntityCtor<T> & {
  readonly typeId: ResourceId;
};
export type RegistrableItemCtor<T extends Item = Item> = ItemCtor<T> & {
  readonly typeId: ResourceId;
};
export type RegistrableProjectileCtor<T extends Projectile = Projectile> =
  ProjectileCtor<T> & {
    readonly typeId: ResourceId;
  };

export const entityTypeRegistry = new TypeRegistry<RegistrableEntityCtor>();
export const itemTypeRegistry = new TypeRegistry<RegistrableItemCtor>();
export const projectileTypeRegistry =
  new TypeRegistry<RegistrableProjectileCtor>();

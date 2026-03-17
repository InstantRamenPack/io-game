import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";
import type { Item } from "@server/items/Item.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import {ZombieSword} from "@server/items/weapons/ZombieSword.ts";

export type EntityCtor<T extends Entity = Entity> = new (...args: any[]) => T;
export type ItemCtor<T extends Item = Item> = new (...args: any[]) => T;
// enforce constructors to contain a ResourceId
export type RegistrableEntityCtor<T extends Entity = Entity> = EntityCtor<T> & {
  readonly typeId: ResourceId;
};
export type RegistrableItemCtor<T extends Item = Item> = ItemCtor<T> & {
  readonly typeId: ResourceId;
};

export const entityTypeRegistry = new TypeRegistry<RegistrableEntityCtor>();
export const itemTypeRegistry = new TypeRegistry<RegistrableItemCtor>();

let registriesBootstrapped = false;

/**
 * Registers all currently implemented concrete entity and item types.
 */
export function bootstrapTypeRegistries(): void {
  if (registriesBootstrapped) {
    return;
  }

  registerEntityType(Player);
  registerEntityType(Zombie);
  registerEntityType(ItemEntity);

  registerItemType(BasicSword);
  registerItemType(ZombieSword);

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function registerEntityType(ctor: RegistrableEntityCtor): void {
  entityTypeRegistry.register(ctor.typeId, ctor);
}

function registerItemType(ctor: RegistrableItemCtor): void {
  itemTypeRegistry.register(ctor.typeId, ctor);
}

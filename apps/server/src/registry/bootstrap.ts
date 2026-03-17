import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";
import type { Item } from "@server/items/Item.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";

export type EntityCtor<T extends Entity = Entity> = new (...args: any[]) => T;
export type ItemCtor<T extends Item = Item> = new (...args: any[]) => T;

export const entityTypeRegistry = new TypeRegistry<EntityCtor>();
export const itemTypeRegistry = new TypeRegistry<ItemCtor>();

let registriesBootstrapped = false;

/**
 * Registers all currently implemented concrete entity and item types.
 */
export function bootstrapTypeRegistries(): void {
  if (registriesBootstrapped) {
    return;
  }

  registerEntityType(Player.typeId, Player);
  registerEntityType(Zombie.typeId, Zombie);
  registerEntityType(ItemEntity.typeId, ItemEntity);

  registerItemType(BasicSword.typeId, BasicSword);

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function registerEntityType(typeId: ResourceId, ctor: EntityCtor): void {
  entityTypeRegistry.register(typeId, ctor);
}

function registerItemType(typeId: ResourceId, ctor: ItemCtor): void {
  itemTypeRegistry.register(typeId, ctor);
}

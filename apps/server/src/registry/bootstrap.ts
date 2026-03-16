import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { TypeRegistry } from "@shared/registry/TypeRegistry.ts";
import {
  CraftingStation,
  Tower,
  Wall,
  Windmill,
} from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import type {
  Projectile,
  ProjectileSpawnConfig,
} from "@server/entities/projectiles/Projectile.ts";
import type { Item } from "@server/items/Item.ts";
import {
  FoodItem,
  StoneItem,
  WoodItem,
} from "@server/items/resources/Materials.ts";
import {
  CraftingStationItem,
  TowerItem,
  WallItem,
  WindmillItem,
} from "@server/items/resources/StructureItems.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export type EntityCtor<T extends Entity = Entity> = new (...args: any[]) => T;
export type ItemCtor<T extends Item = Item> = new (...args: any[]) => T;
export type ProjectileCtor<T extends Projectile = Projectile> = new (
  id: number,
  config: ProjectileSpawnConfig,
) => T;
// enforce constructors to contain a ResourceId
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
  registerEntityType(Wall);
  registerEntityType(Tower);
  registerEntityType(Windmill);
  registerEntityType(CraftingStation);
  registerEntityType(ItemEntity);
  registerEntityType(BasicBullet);

  registerItemType(BasicGun);
  registerItemType(BasicSword);
  registerItemType(WoodItem);
  registerItemType(StoneItem);
  registerItemType(FoodItem);
  registerItemType(WallItem);
  registerItemType(TowerItem);
  registerItemType(WindmillItem);
  registerItemType(CraftingStationItem);
  registerItemType(ZombieSword);
  registerProjectileType(BasicBullet);

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  projectileTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function registerEntityType(ctor: RegistrableEntityCtor): void {
  entityTypeRegistry.register(ctor.typeId, ctor);
}

function registerItemType(ctor: RegistrableItemCtor): void {
  itemTypeRegistry.register(ctor.typeId, ctor);
}

function registerProjectileType(ctor: RegistrableProjectileCtor): void {
  projectileTypeRegistry.register(ctor.typeId, ctor);
}

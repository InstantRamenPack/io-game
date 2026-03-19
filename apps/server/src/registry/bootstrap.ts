import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Tower } from "@server/entities/buildings/Tower.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Windmill } from "@server/entities/buildings/Windmill.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { FoodItem } from "@server/items/resources/materials/FoodItem.ts";
import { StoneItem } from "@server/items/resources/materials/StoneItem.ts";
import { WoodItem } from "@server/items/resources/materials/WoodItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { TowerItem } from "@server/items/resources/structures/TowerItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";
import { WindmillItem } from "@server/items/resources/structures/WindmillItem.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
  projectileTypeRegistry,
  type RegistrableEntityCtor,
  type RegistrableItemCtor,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";

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

import {
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Tower } from "@server/entities/buildings/Tower.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Windmill } from "@server/entities/buildings/Windmill.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Skeleton } from "@server/entities/enemies/Skeleton.ts";
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
  type EntityTypeEntry,
  type ItemTypeEntry,
  type RegistrableEntityCtor,
  type RegistrableItemCtor,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";
import {
  requireEntityClassMetadata,
  requireItemClassMetadata,
} from "@server/registry/typeMetadata.ts";

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
  registerEntityType(Skeleton);
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

  validateRegistryContent();

  entityTypeRegistry.freeze();
  itemTypeRegistry.freeze();
  projectileTypeRegistry.freeze();
  registriesBootstrapped = true;
}

function registerEntityType(ctor: RegistrableEntityCtor): void {
  const metadata = requireEntityClassMetadata(ctor);
  const content = requireEntityContent(ctor.typeId);
  const entry: EntityTypeEntry = {
    typeId: ctor.typeId,
    kind: metadata.kind,
    resourceName: metadata.resourceName,
    label: content.label,
    content,
    ctor,
  };
  entityTypeRegistry.register(entry.typeId, entry);
}

function registerItemType(ctor: RegistrableItemCtor): void {
  const metadata = requireItemClassMetadata(ctor);
  const content = requireItemContent(ctor.typeId);
  const entry: ItemTypeEntry = {
    typeId: ctor.typeId,
    kind: "item",
    resourceName: metadata.resourceName,
    label: content.label,
    stackMax: metadata.stackMax,
    buildingTypeId: metadata.buildingTypeId,
    content,
    recipe: content.recipe,
    ctor,
  };
  itemTypeRegistry.register(entry.typeId, entry);
}

function registerProjectileType(ctor: RegistrableProjectileCtor): void {
  projectileTypeRegistry.register(ctor.typeId, ctor);
}

function validateRegistryContent(): void {
  for (const [, itemEntry] of itemTypeRegistry.entries()) {
    if (itemEntry.buildingTypeId && !entityTypeRegistry.has(itemEntry.buildingTypeId)) {
      throw new Error(
        `Item ${itemEntry.typeId} references unknown building type ${itemEntry.buildingTypeId}.`,
      );
    }

    for (const cost of itemEntry.recipe?.costs ?? []) {
      if (!itemTypeRegistry.has(cost.typeId)) {
        throw new Error(
          `Item ${itemEntry.typeId} recipe references unknown item ${cost.typeId}.`,
        );
      }
    }
  }
}

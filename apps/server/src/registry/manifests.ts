import {
  requireEffectContent,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Landmine } from "@server/entities/buildings/Landmine.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { Bomber } from "@server/entities/enemies/Bomber.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
import { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";
import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { ConfusionEffect } from "@server/effects/builtin/ConfusionEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { Taser } from "@server/items/weapons/Taser.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { LandmineItem } from "@server/items/resources/structures/LandmineItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";
import { CrossbowMagItem } from "@server/items/resources/materials/CrossbowMagItem.ts";
import { FoodItem } from "@server/items/resources/materials/FoodItem.ts";
import { GunMagItem } from "@server/items/resources/materials/GunMagItem.ts";
import { StoneItem } from "@server/items/resources/materials/StoneItem.ts";
import { WoodItem } from "@server/items/resources/materials/WoodItem.ts";
import type {
  EffectTypeEntry,
  EntityTypeEntry,
  ItemTypeEntry,
  RegistrableEffectCtor,
  RegistrableEntityCtor,
  RegistrableItemCtor,
} from "@server/registry/registries.ts";

function makeEntityTypeEntry(ctor: RegistrableEntityCtor): EntityTypeEntry {
  return {
    typeId: ctor.typeId,
    kind: ctor.kind,
    content: requireEntityContent(ctor.typeId),
    ctor,
  };
}

function makeItemTypeEntry(ctor: RegistrableItemCtor): ItemTypeEntry {
  return {
    typeId: ctor.typeId,
    content: requireItemContent(ctor.typeId),
    ctor,
  };
}

function makeEffectTypeEntry(ctor: RegistrableEffectCtor): EffectTypeEntry {
  return {
    typeId: ctor.typeId,
    content: requireEffectContent(ctor.typeId),
    ctor,
  };
}

export const entityTypeManifests = [
  makeEntityTypeEntry(Player),
  makeEntityTypeEntry(ItemEntity),
  makeEntityTypeEntry(Drifter),
  makeEntityTypeEntry(Megaknight),
  makeEntityTypeEntry(Saboteur),
  makeEntityTypeEntry(Shoota),
  makeEntityTypeEntry(Police),
  makeEntityTypeEntry(Wallbreaker),
  makeEntityTypeEntry(Bomber),
  makeEntityTypeEntry(Wall),
  makeEntityTypeEntry(Cannon),
  makeEntityTypeEntry(CraftingStation),
  makeEntityTypeEntry(Landmine),
  makeEntityTypeEntry(BasicBullet),
  makeEntityTypeEntry(CannonBullet),
  makeEntityTypeEntry(CrossbowArrow),
  makeEntityTypeEntry(HomingDrone),
  makeEntityTypeEntry(RifleBullet),
] as const;

export const itemTypeManifests = [
  makeItemTypeEntry(BasicGun),
  makeItemTypeEntry(BasicRifle),
  makeItemTypeEntry(BasicSpear),
  makeItemTypeEntry(BasicSword),
  makeItemTypeEntry(Crossbow),
  makeItemTypeEntry(SpikedSpear),
  makeItemTypeEntry(Taser),
  makeItemTypeEntry(DroneShooter),
  makeItemTypeEntry(ZombieSword),
  makeItemTypeEntry(SaboteurSword),
  makeItemTypeEntry(WoodItem),
  makeItemTypeEntry(StoneItem),
  makeItemTypeEntry(FoodItem),
  makeItemTypeEntry(GunMagItem),
  makeItemTypeEntry(CrossbowMagItem),
  makeItemTypeEntry(WallItem),
  makeItemTypeEntry(CannonItem),
  makeItemTypeEntry(CraftingStationItem),
  makeItemTypeEntry(LandmineItem),
] as const;

export const effectTypeManifests = [
  makeEffectTypeEntry(BleedingEffect),
  makeEffectTypeEntry(ConfusionEffect),
  makeEffectTypeEntry(DamageEffect),
  makeEffectTypeEntry(KnockbackEffect),
  makeEffectTypeEntry(StunnedEffect),
] as const;

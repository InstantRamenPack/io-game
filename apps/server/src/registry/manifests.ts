import {
  requireEffectContent,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
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
import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { BaseballBat } from "@server/items/weapons/BaseballBat.ts";
import { BasicDagger } from "@server/items/weapons/BasicDagger.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { LeadPipe } from "@server/items/weapons/LeadPipe.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { Taser } from "@server/items/weapons/Taser.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { CannonItem } from "@server/items/structures/CannonItem.ts";
import { CraftingStationItem } from "@server/items/structures/CraftingStationItem.ts";
import { LandmineItem } from "@server/items/structures/LandmineItem.ts";
import { WallItem } from "@server/items/structures/WallItem.ts";
import { CrossbowMagazineItem } from "@server/items/magazines/CrossbowMagazineItem.ts";
import { DroneMagazineItem } from "@server/items/magazines/DroneMagazineItem.ts";
import { GunMagazineItem } from "@server/items/magazines/GunMagazineItem.ts";
import { BlueprintSpikedSpearItem } from "@server/items/blueprints/BlueprintSpikedSpearItem.ts";
import { StoneItem } from "@server/items/materials/StoneItem.ts";
import { WoodItem } from "@server/items/materials/WoodItem.ts";
import type {
  EffectTypeEntry,
  EntityTypeEntry,
  ItemTypeEntry,
  RegistrableEffectCtor,
  RegistrableEntityCtor,
  RegistrableItemCtor,
} from "@server/registry/registries.ts";

function makeTypeEntry<TCtor extends { readonly typeId: ResourceId }, TContent>(
  ctor: TCtor,
  content: TContent,
): { typeId: ResourceId; content: TContent; ctor: TCtor } {
  return {
    typeId: ctor.typeId,
    content,
    ctor,
  };
}

function makeEntityTypeEntry(ctor: RegistrableEntityCtor): EntityTypeEntry {
  return {
    ...makeTypeEntry(ctor, requireEntityContent(ctor.typeId)),
    kind: ctor.kind,
  };
}

function makeItemTypeEntry(ctor: RegistrableItemCtor): ItemTypeEntry {
  return makeTypeEntry(ctor, requireItemContent(ctor.typeId));
}

function makeEffectTypeEntry(ctor: RegistrableEffectCtor): EffectTypeEntry {
  return makeTypeEntry(ctor, requireEffectContent(ctor.typeId));
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
  makeItemTypeEntry(BaseballBat),
  makeItemTypeEntry(BasicDagger),
  makeItemTypeEntry(BasicGun),
  makeItemTypeEntry(BasicRifle),
  makeItemTypeEntry(BasicSpear),
  makeItemTypeEntry(BasicSword),
  makeItemTypeEntry(Crossbow),
  makeItemTypeEntry(LeadPipe),
  makeItemTypeEntry(SpikedSpear),
  makeItemTypeEntry(Taser),
  makeItemTypeEntry(DroneShooter),
  makeItemTypeEntry(ZombieSword),
  makeItemTypeEntry(SaboteurSword),
  makeItemTypeEntry(WoodItem),
  makeItemTypeEntry(StoneItem),
  makeItemTypeEntry(BlueprintSpikedSpearItem),
  makeItemTypeEntry(GunMagazineItem),
  makeItemTypeEntry(CrossbowMagazineItem),
  makeItemTypeEntry(DroneMagazineItem),
  makeItemTypeEntry(WallItem),
  makeItemTypeEntry(CannonItem),
  makeItemTypeEntry(CraftingStationItem),
  makeItemTypeEntry(LandmineItem),
] as const;

export const effectTypeManifests = [
  makeEffectTypeEntry(BleedingEffect),
  makeEffectTypeEntry(ConfusionEffect),
  makeEffectTypeEntry(DamageEffect),
  makeEffectTypeEntry(FracturedEffect),
  makeEffectTypeEntry(KnockbackEffect),
  makeEffectTypeEntry(StunnedEffect),
] as const;

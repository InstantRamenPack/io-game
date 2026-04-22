import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Landmine } from "@server/entities/buildings/Landmine.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Bomber } from "@server/entities/enemies/Bomber.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
import { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";
import { SniperBullet } from "@server/entities/projectiles/SniperBullet.ts";
import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { ConfusionEffect } from "@server/effects/builtin/ConfusionEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { BlueprintBasicRifleItem } from "@server/items/blueprints/BlueprintBasicRifleItem.ts";
import { BlueprintSniperItem } from "@server/items/blueprints/BlueprintSniperItem.ts";
import { BlueprintSpikedSpearItem } from "@server/items/blueprints/BlueprintSpikedSpearItem.ts";
import { CrossbowMagazineItem } from "@server/items/magazines/CrossbowMagazineItem.ts";
import { DroneMagazineItem } from "@server/items/magazines/DroneMagazineItem.ts";
import { GunMagazineItem } from "@server/items/magazines/GunMagazineItem.ts";
import { SniperMagazineItem } from "@server/items/magazines/SniperMagazineItem.ts";
import { StoneItem } from "@server/items/materials/StoneItem.ts";
import { WoodItem } from "@server/items/materials/WoodItem.ts";
import { CannonItem } from "@server/items/structures/CannonItem.ts";
import { ChestItem } from "@server/items/structures/ChestItem.ts";
import { CraftingStationItem } from "@server/items/structures/CraftingStationItem.ts";
import { LandmineItem } from "@server/items/structures/LandmineItem.ts";
import { WallItem } from "@server/items/structures/WallItem.ts";
import { BaseballBat } from "@server/items/weapons/BaseballBat.ts";
import { BasicDagger } from "@server/items/weapons/BasicDagger.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { LeadPipe } from "@server/items/weapons/LeadPipe.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
import { Taser } from "@server/items/weapons/Taser.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { Sniper } from "@server/items/weapons/Sniper.ts";

export const entityRuntimeCtors = [
  Player,
  ItemEntity,
  Bomber,
  Drifter,
  Megaknight,
  Police,
  Saboteur,
  Shoota,
  Wallbreaker,
  Cannon,
  Chest,
  CraftingStation,
  Landmine,
  Wall,
  BasicBullet,
  CannonBullet,
  CrossbowArrow,
  HomingDrone,
  RifleBullet,
  SniperBullet,
] as const;

export const itemRuntimeCtors = [
  BaseballBat,
  BasicDagger,
  BasicGun,
  BasicRifle,
  BasicSpear,
  BasicSword,
  Crossbow,
  LeadPipe,
  Sniper,
  SpikedSpear,
  Taser,
  DroneShooter,
  ZombieSword,
  SaboteurSword,
  WoodItem,
  StoneItem,
  BlueprintBasicRifleItem,
  BlueprintSniperItem,
  BlueprintSpikedSpearItem,
  GunMagazineItem,
  CrossbowMagazineItem,
  DroneMagazineItem,
  SniperMagazineItem,
  WallItem,
  CannonItem,
  ChestItem,
  CraftingStationItem,
  LandmineItem,
] as const;

export const effectRuntimeCtors = [
  BleedingEffect,
  ConfusionEffect,
  DamageEffect,
  FracturedEffect,
  KnockbackEffect,
  StunnedEffect,
] as const;

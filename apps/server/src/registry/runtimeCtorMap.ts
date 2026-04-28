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
import { HouseL } from "@server/entities/structures/HouseL.ts";
import { HouseM } from "@server/entities/structures/HouseM.ts";
import { HouseXl } from "@server/entities/structures/HouseXl.ts";
import { DungeonWall } from "@server/entities/structures/DungeonWall.ts";
import { FenceH } from "@server/entities/structures/FenceH.ts";
import { FenceV } from "@server/entities/structures/FenceV.ts";
import { Tent } from "@server/entities/structures/Tent.ts";
import { Tree } from "@server/entities/structures/Tree.ts";
import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { ConfusionEffect } from "@server/effects/builtin/ConfusionEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { BlueprintBasicRifleItem } from "@server/items/blueprints/BlueprintBasicRifleItem.ts";
import { BlueprintKatanaItem } from "@server/items/blueprints/BlueprintKatanaItem.ts";
import { BlueprintSniperItem } from "@server/items/blueprints/BlueprintSniperItem.ts";
import { BlueprintSpikedSpearItem } from "@server/items/blueprints/BlueprintSpikedSpearItem.ts";
import { CrossbowMagazineItem } from "@server/items/magazines/CrossbowMagazineItem.ts";
import { DroneMagazineItem } from "@server/items/magazines/DroneMagazineItem.ts";
import { GunMagazineItem } from "@server/items/magazines/GunMagazineItem.ts";
import { SniperMagazineItem } from "@server/items/magazines/SniperMagazineItem.ts";
import { JunkFoodItem } from "@server/items/food/JunkFoodItem.ts";
import { QualityFoodItem } from "@server/items/food/QualityFoodItem.ts";
import { HunkItem } from "@server/items/materials/HunkItem.ts";
import { CannonItem } from "@server/items/structures/CannonItem.ts";
import { ChestItem } from "@server/items/structures/ChestItem.ts";
import { CraftingStationItem } from "@server/items/structures/CraftingStationItem.ts";
import { LandmineItem } from "@server/items/structures/LandmineItem.ts";
import { StructureHouseLItem } from "@server/items/structures/StructureHouseLItem.ts";
import { StructureHouseMItem } from "@server/items/structures/StructureHouseMItem.ts";
import { StructureFenceHItem } from "@server/items/structures/StructureFenceHItem.ts";
import { StructureFenceVItem } from "@server/items/structures/StructureFenceVItem.ts";
import { StructureTentItem } from "@server/items/structures/StructureTentItem.ts";
import { StructureTreeItem } from "@server/items/structures/StructureTreeItem.ts";
import { WallItem } from "@server/items/structures/WallItem.ts";
import { BaseballBat } from "@server/items/weapons/BaseballBat.ts";
import { BasicDagger } from "@server/items/weapons/BasicDagger.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { Cleaver } from "@server/items/weapons/Cleaver.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import { LeadPipe } from "@server/items/weapons/LeadPipe.ts";
import { Katana } from "@server/items/weapons/Katana.ts";
import { Scissors } from "@server/items/weapons/Scissors.ts";
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
  HouseL,
  HouseM,
  HouseXl,
  Cannon,
  Chest,
  CraftingStation,
  FenceH,
  FenceV,
  DungeonWall,
  Landmine,
  Tent,
  Tree,
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
  Cleaver,
  Crossbow,
  Fists,
  Katana,
  LeadPipe,
  Scissors,
  Sniper,
  SpikedSpear,
  Taser,
  DroneShooter,
  ZombieSword,
  SaboteurSword,
  HunkItem,
  JunkFoodItem,
  QualityFoodItem,
  BlueprintBasicRifleItem,
  BlueprintKatanaItem,
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
  StructureHouseLItem,
  StructureHouseMItem,
  StructureFenceHItem,
  StructureFenceVItem,
  StructureTentItem,
  StructureTreeItem,
] as const;

export const effectRuntimeCtors = [
  BleedingEffect,
  ConfusionEffect,
  DamageEffect,
  FracturedEffect,
  KnockbackEffect,
  StunnedEffect,
] as const;

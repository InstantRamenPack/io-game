import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { Landmine } from "@server/entities/buildings/Landmine.ts";
import { Tripwire } from "@server/entities/buildings/Tripwire.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Bomber } from "@server/entities/enemies/Bomber.ts";
import { Commander } from "@server/entities/enemies/Commander.ts";
import { Crate } from "@server/entities/enemies/Crate.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Ranger } from "@server/entities/enemies/Ranger.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { SniperEnemy } from "@server/entities/enemies/SniperEnemy.ts";
import { Stalker } from "@server/entities/enemies/Stalker.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
import { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";
import { SniperBullet } from "@server/entities/projectiles/SniperBullet.ts";
import { ThanosBullet } from "@server/entities/projectiles/ThanosBullet.ts";
import { ThanosRocket } from "@server/entities/projectiles/ThanosRocket.ts";
import { HouseL } from "@server/entities/structures/HouseL.ts";
import { HouseM } from "@server/entities/structures/HouseM.ts";
import { HouseS } from "@server/entities/structures/HouseS.ts";
import { HouseXl } from "@server/entities/structures/HouseXl.ts";
import { Barracks } from "@server/entities/structures/Barracks.ts";
import { CampShelter } from "@server/entities/structures/CampShelter.ts";
import { CommandPost } from "@server/entities/structures/CommandPost.ts";
import { Dungeon } from "@server/entities/structures/Dungeon.ts";
import { DungeonWall } from "@server/entities/structures/DungeonWall.ts";
import { FenceH } from "@server/entities/structures/FenceH.ts";
import { FenceV } from "@server/entities/structures/FenceV.ts";
import { GuardTower } from "@server/entities/structures/GuardTower.ts";
import { MarketStall } from "@server/entities/structures/MarketStall.ts";
import { Tree } from "@server/entities/structures/Tree.ts";
import { VehicleWreck } from "@server/entities/structures/VehicleWreck.ts";
import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { ConfusionEffect } from "@server/effects/builtin/ConfusionEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { HealEffect } from "@server/effects/builtin/HealEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { SpeedEffect } from "@server/effects/builtin/SpeedEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { BlueprintHalberdItem } from "@server/items/blueprints/BlueprintHalberdItem.ts";
import { BlueprintHeavyPistolItem } from "@server/items/blueprints/BlueprintHeavyPistolItem.ts";
import { BlueprintLmgItem } from "@server/items/blueprints/BlueprintLmgItem.ts";
import { BlueprintSniperItem } from "@server/items/blueprints/BlueprintSniperItem.ts";
import { CrossbowMagazineItem } from "@server/items/magazines/CrossbowMagazineItem.ts";
import { DroneMagazineItem } from "@server/items/magazines/DroneMagazineItem.ts";
import { PistolMagazineItem } from "@server/items/magazines/PistolMagazineItem.ts";
import { RifleMagazineItem } from "@server/items/magazines/RifleMagazineItem.ts";
import { SniperMagazineItem } from "@server/items/magazines/SniperMagazineItem.ts";
import { HunkItem } from "@server/items/materials/HunkItem.ts";
import { CrudeBandageItem } from "@server/items/medical/CrudeBandageItem.ts";
import { MedkitItem } from "@server/items/medical/MedkitItem.ts";
import { SpeedPotionItem } from "@server/items/medical/SpeedPotionItem.ts";
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
import { Cleaver } from "@server/items/weapons/Cleaver.ts";
import { Carbine } from "@server/items/weapons/Carbine.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { FireAxe } from "@server/items/weapons/FireAxe.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import { Halberd } from "@server/items/weapons/Halberd.ts";
import { HeavyPistol } from "@server/items/weapons/HeavyPistol.ts";
import { Katana } from "@server/items/weapons/Katana.ts";
import { Lmg } from "@server/items/weapons/Lmg.ts";
import { Machete } from "@server/items/weapons/Machete.ts";
import { MachinePistol } from "@server/items/weapons/MachinePistol.ts";
import { Scissors } from "@server/items/weapons/Scissors.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
import { Taser } from "@server/items/weapons/Taser.ts";
import { Sniper } from "@server/items/weapons/Sniper.ts";
import { ThanosFist } from "@server/items/weapons/ThanosFist.ts";
import { ThanosRifle } from "@server/items/weapons/ThanosRifle.ts";
import { ThanosRocketLauncher } from "@server/items/weapons/ThanosRocketLauncher.ts";

export const entityRuntimeCtors = [
  Player,
  ItemEntity,
  Bomber,
  Commander,
  Drifter,
  Megaknight,
  Police,
  Ranger,
  Saboteur,
  Shoota,
  Thanos,
  SniperEnemy,
  Stalker,
  Wallbreaker,
  HouseL,
  HouseM,
  HouseS,
  HouseXl,
  Barracks,
  CampShelter,
  CommandPost,
  Dungeon,
  Cannon,
  Chest,
  CommsTower,
  Crate,
  CraftingStation,
  EnergyTower,
  FenceH,
  FenceV,
  GuardTower,
  DungeonWall,
  MarketStall,
  Landmine,
  Recycler,
  Tree,
  VehicleWreck,
  Tripwire,
  Wall,
  BasicBullet,
  CannonBullet,
  CrossbowArrow,
  HomingDrone,
  RifleBullet,
  SniperBullet,
  ThanosBullet,
  ThanosRocket,
] as const;

export const itemRuntimeCtors = [
  BaseballBat,
  BasicDagger,
  BasicGun,
  BasicRifle,
  BasicSpear,
  BasicSword,
  Cleaver,
  Carbine,
  Crossbow,
  Fists,
  FireAxe,
  Halberd,
  HeavyPistol,
  Katana,
  Lmg,
  Machete,
  MachinePistol,
  Scissors,
  Sniper,
  SpikedSpear,
  Taser,
  DroneShooter,
  SaboteurSword,
  ThanosFist,
  ThanosRifle,
  ThanosRocketLauncher,
  HunkItem,
  CrudeBandageItem,
  MedkitItem,
  SpeedPotionItem,
  BlueprintHalberdItem,
  BlueprintHeavyPistolItem,
  BlueprintLmgItem,
  BlueprintSniperItem,
  PistolMagazineItem,
  RifleMagazineItem,
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
  HealEffect,
  KnockbackEffect,
  SpeedEffect,
  StunnedEffect,
] as const;

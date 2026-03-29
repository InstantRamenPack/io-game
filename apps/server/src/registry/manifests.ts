import {
  requireEffectContent,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";
import { FoodItem } from "@server/items/resources/materials/FoodItem.ts";
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
  makeEntityTypeEntry(Wall),
  makeEntityTypeEntry(Cannon),
  makeEntityTypeEntry(CraftingStation),
  makeEntityTypeEntry(BasicBullet),
  makeEntityTypeEntry(CannonBullet),
  makeEntityTypeEntry(CrossbowArrow),
] as const;

export const itemTypeManifests = [
  makeItemTypeEntry(BasicGun),
  makeItemTypeEntry(BasicSpear),
  makeItemTypeEntry(BasicSword),
  makeItemTypeEntry(Crossbow),
  makeItemTypeEntry(ZombieSword),
  makeItemTypeEntry(SaboteurSword),
  makeItemTypeEntry(WoodItem),
  makeItemTypeEntry(StoneItem),
  makeItemTypeEntry(FoodItem),
  makeItemTypeEntry(WallItem),
  makeItemTypeEntry(CannonItem),
  makeItemTypeEntry(CraftingStationItem),
] as const;

export const effectTypeManifests = [
  makeEffectTypeEntry(DamageEffect),
  makeEffectTypeEntry(KnockbackEffect),
] as const;

import { Building } from "@server/entities/Building.ts";
import { Tower } from "@server/entities/tower/Tower.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import { Structure } from "@server/entities/Structure.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type {
  RegistrableEntityCtor,
  RegistrableItemCtor,
  RegistrableProjectileCtor,
} from "@server/registry/registries.ts";

export type SpawnableEntityCtor = RegistrableEntityCtor &
  (new (entityId: number) => Entity);

type BuildingCtor = RegistrableEntityCtor &
  (new (id: number, tier?: number, ownerId?: number) => Building);
type StructureCtor = RegistrableEntityCtor & (new (id: number) => Structure);

export function isWeaponCtor(
  ctor: RegistrableItemCtor,
): ctor is RegistrableItemCtor<Weapon> {
  return ctor.prototype instanceof Weapon;
}

export function isSpawnableEntityCtor(
  ctor: RegistrableEntityCtor,
): ctor is SpawnableEntityCtor {
  return ctor.prototype instanceof Entity;
}

export function isProjectileCtor(
  ctor: RegistrableEntityCtor,
): ctor is RegistrableProjectileCtor {
  return ctor.prototype instanceof Projectile;
}

export function isBuildingCtor(
  ctor: RegistrableEntityCtor,
): ctor is BuildingCtor {
  return ctor.prototype instanceof Building;
}

type TowerCtor = RegistrableEntityCtor &
  (new (id: number, tier?: number, ownerId?: number) => Tower);

export function isTowerCtor(ctor: RegistrableEntityCtor): ctor is TowerCtor {
  return ctor.prototype instanceof Tower;
}

export function isStructureCtor(
  ctor: RegistrableEntityCtor,
): ctor is StructureCtor {
  return ctor.prototype instanceof Structure;
}

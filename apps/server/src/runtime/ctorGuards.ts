import { Building } from "@server/entities/Building.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type {
  RegistrableEntityCtor,
  RegistrableItemCtor,
  RegistrableProjectileCtor,
} from "@server/registry/registries.ts";

export type SpawnableEntityCtor = RegistrableEntityCtor &
  (new (entityId: number) => Entity);

type BuildingCtor = RegistrableEntityCtor &
  (new (
    id: number,
    label: string,
    tier?: number,
    ownerId?: number,
  ) => Building);

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

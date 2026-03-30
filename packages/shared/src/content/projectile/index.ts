import projectileEntityJson from "@shared/content/projectile/basic_bullet.json";
import cannonProjectileEntityJson from "@shared/content/projectile/cannon_bullet.json";
import crossbowArrowProjectileEntityJson from "@shared/content/projectile/crossbow_arrow.json";
import homingDroneProjectileEntityJson from "@shared/content/projectile/homing_drone.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const projectileContentEntries = [
  makeParsedEntityContentEntry(
    "projectile",
    "crossbow_arrow",
    crossbowArrowProjectileEntityJson,
  ),
  makeParsedEntityContentEntry(
    "projectile",
    "cannon_bullet",
    cannonProjectileEntityJson,
  ),
  makeParsedEntityContentEntry(
    "projectile",
    "basic_bullet",
    projectileEntityJson,
  ),
  makeParsedEntityContentEntry(
    "projectile",
    "homing_drone",
    homingDroneProjectileEntityJson,
  ),
] as const;

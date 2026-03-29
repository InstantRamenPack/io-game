import projectileEntityJson from "@shared/content/projectile/basic_bullet.json";
import cannonProjectileEntityJson from "@shared/content/projectile/cannon_bullet.json";
import crossbowArrowProjectileEntityJson from "@shared/content/projectile/crossbowarrow.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const projectileContentEntries = [
  makeParsedEntityContentEntry(
    "projectile",
    "crossbowarrow",
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
] as const;

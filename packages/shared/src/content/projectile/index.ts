import projectileEntityJson from "@shared/content/projectile/basic_bullet.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const projectileContentEntries = [
  makeParsedEntityContentEntry(
    "projectile",
    "basic_bullet",
    projectileEntityJson,
  ),
] as const;

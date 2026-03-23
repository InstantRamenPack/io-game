import megaknightEntityJson from "@shared/content/enemy/megaknight.json";
import skeletonEntityJson from "@shared/content/enemy/skeleton.json";
import zombieEntityJson from "@shared/content/enemy/zombie.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const enemyContentEntries = [
  makeParsedEntityContentEntry("enemy", "zombie", zombieEntityJson),
  makeParsedEntityContentEntry("enemy", "skeleton", skeletonEntityJson),
  makeParsedEntityContentEntry("enemy", "megaknight", megaknightEntityJson),
] as const;

import megaknightEntityJson from "@shared/content/enemy/megaknight.json";
import saboteurEntityJson from "@shared/content/enemy/saboteur.json";
import shootaEntityJson from "@shared/content/enemy/shoota.json";
import drifterEntityJson from "@shared/content/enemy/drifter.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const enemyContentEntries = [
  makeParsedEntityContentEntry("enemy", "drifter", drifterEntityJson),
  makeParsedEntityContentEntry("enemy", "shoota", shootaEntityJson),
  makeParsedEntityContentEntry("enemy", "megaknight", megaknightEntityJson),
  makeParsedEntityContentEntry("enemy", "saboteur", saboteurEntityJson),
] as const;

import megaknightEntityJson from "@shared/content/enemy/megaknight.json";
import policeEntityJson from "@shared/content/enemy/police.json";
import saboteurEntityJson from "@shared/content/enemy/saboteur.json";
import shootaEntityJson from "@shared/content/enemy/shoota.json";
import drifterEntityJson from "@shared/content/enemy/drifter.json";
import wallbreakerEntityJson from "@shared/content/enemy/wallbreaker.json";
import bomberEntityJson from "@shared/content/enemy/bomber.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const enemyContentEntries = [
  makeParsedEntityContentEntry("enemy", "drifter", drifterEntityJson),
  makeParsedEntityContentEntry("enemy", "shoota", shootaEntityJson),
  makeParsedEntityContentEntry("enemy", "megaknight", megaknightEntityJson),
  makeParsedEntityContentEntry("enemy", "police", policeEntityJson),
  makeParsedEntityContentEntry("enemy", "saboteur", saboteurEntityJson),
  makeParsedEntityContentEntry("enemy", "wallbreaker", wallbreakerEntityJson),
  makeParsedEntityContentEntry("enemy", "bomber", bomberEntityJson),
] as const;

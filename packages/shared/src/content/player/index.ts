import playerEntityJson from "@shared/content/player/base.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const playerContentEntries = [
  makeParsedEntityContentEntry("player", "base", playerEntityJson),
] as const;

import cannonEntityJson from "@shared/content/building/cannon.json";
import craftingStationEntityJson from "@shared/content/building/crafting_station.json";
import landmineEntityJson from "@shared/content/building/landmine.json";
import wallEntityJson from "@shared/content/building/wall.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const buildingContentEntries = [
  makeParsedEntityContentEntry("building", "wall", wallEntityJson),
  makeParsedEntityContentEntry("building", "cannon", cannonEntityJson),
  makeParsedEntityContentEntry(
    "building",
    "crafting_station",
    craftingStationEntityJson,
  ),
  makeParsedEntityContentEntry("building", "landmine", landmineEntityJson),
] as const;

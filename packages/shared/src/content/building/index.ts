import cannonEntityJson from "@shared/content/building/cannon.json";
import craftingStationEntityJson from "@shared/content/building/crafting_station.json";
import wallEntityJson from "@shared/content/building/wall.json";
import windmillEntityJson from "@shared/content/building/windmill.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const buildingContentEntries = [
  makeParsedEntityContentEntry("building", "wall", wallEntityJson),
  makeParsedEntityContentEntry("building", "cannon", cannonEntityJson),
  makeParsedEntityContentEntry("building", "windmill", windmillEntityJson),
  makeParsedEntityContentEntry(
    "building",
    "crafting_station",
    craftingStationEntityJson,
  ),
] as const;

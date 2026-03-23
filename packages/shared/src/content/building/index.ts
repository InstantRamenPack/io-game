import craftingStationEntityJson from "@shared/content/building/crafting_station.json";
import towerEntityJson from "@shared/content/building/tower.json";
import wallEntityJson from "@shared/content/building/wall.json";
import windmillEntityJson from "@shared/content/building/windmill.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const buildingContentEntries = [
  makeParsedEntityContentEntry("building", "wall", wallEntityJson),
  makeParsedEntityContentEntry("building", "tower", towerEntityJson),
  makeParsedEntityContentEntry("building", "windmill", windmillEntityJson),
  makeParsedEntityContentEntry(
    "building",
    "crafting_station",
    craftingStationEntityJson,
  ),
] as const;

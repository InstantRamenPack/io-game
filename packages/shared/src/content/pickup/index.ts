import pickupEntityJson from "@shared/content/pickup/item_entity.json";
import { makeParsedEntityContentEntry } from "@shared/content/parseContent.ts";

export const pickupContentEntries = [
  makeParsedEntityContentEntry("pickup", "item_entity", pickupEntityJson),
] as const;

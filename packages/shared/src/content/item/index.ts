import basicGunItemJson from "@shared/content/item/basic_gun.json";
import basicSpearItemJson from "@shared/content/item/basic_spear.json";
import basicSwordItemJson from "@shared/content/item/basic_sword.json";
import cannonItemJson from "@shared/content/item/cannon.json";
import craftingStationItemJson from "@shared/content/item/crafting_station.json";
import foodItemJson from "@shared/content/item/food.json";
import stoneItemJson from "@shared/content/item/stone.json";
import wallItemJson from "@shared/content/item/wall.json";
import windmillItemJson from "@shared/content/item/windmill.json";
import woodItemJson from "@shared/content/item/wood.json";
import zombieSwordItemJson from "@shared/content/item/zombie_sword.json";
import saboteurSwordItemJson from "@shared/content/item/saboteur_sword.json";
import { makeParsedItemContentEntry } from "@shared/content/parseContent.ts";

export const itemContentEntries = [
  makeParsedItemContentEntry("basic_gun", basicGunItemJson),
  makeParsedItemContentEntry("basic_spear", basicSpearItemJson),
  makeParsedItemContentEntry("basic_sword", basicSwordItemJson),
  makeParsedItemContentEntry("zombie_sword", zombieSwordItemJson),
  makeParsedItemContentEntry("saboteur_sword", saboteurSwordItemJson),
  makeParsedItemContentEntry("wood", woodItemJson),
  makeParsedItemContentEntry("stone", stoneItemJson),
  makeParsedItemContentEntry("food", foodItemJson),
  makeParsedItemContentEntry("wall", wallItemJson),
  makeParsedItemContentEntry("cannon", cannonItemJson),
  makeParsedItemContentEntry("windmill", windmillItemJson),
  makeParsedItemContentEntry("crafting_station", craftingStationItemJson),
] as const;

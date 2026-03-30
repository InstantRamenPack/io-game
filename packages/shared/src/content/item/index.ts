import basicGunItemJson from "@shared/content/item/basic_gun.json";
import basicSpearItemJson from "@shared/content/item/basic_spear.json";
import basicSwordItemJson from "@shared/content/item/basic_sword.json";
import cannonItemJson from "@shared/content/item/cannon.json";
import crossbowMagItemJson from "@shared/content/item/crossbow_mag.json";
import crossbowItemJson from "@shared/content/item/crossbow.json";
import craftingStationItemJson from "@shared/content/item/crafting_station.json";
import droneShooterItemJson from "@shared/content/item/drone_shooter.json";
import foodItemJson from "@shared/content/item/food.json";
import gunMagItemJson from "@shared/content/item/gun_mag.json";
import landmineItemJson from "@shared/content/item/landmine.json";
import spikedSpearItemJson from "@shared/content/item/spiked_spear.json";
import stoneItemJson from "@shared/content/item/stone.json";
import taserItemJson from "@shared/content/item/taser.json";
import wallItemJson from "@shared/content/item/wall.json";
import woodItemJson from "@shared/content/item/wood.json";
import zombieSwordItemJson from "@shared/content/item/zombie_sword.json";
import saboteurSwordItemJson from "@shared/content/item/saboteur_sword.json";
import { makeParsedItemContentEntry } from "@shared/content/parseContent.ts";

export const itemContentEntries = [
  makeParsedItemContentEntry("basic_gun", basicGunItemJson),
  makeParsedItemContentEntry("basic_spear", basicSpearItemJson),
  makeParsedItemContentEntry("basic_sword", basicSwordItemJson),
  makeParsedItemContentEntry("crossbow", crossbowItemJson),
  makeParsedItemContentEntry("spiked_spear", spikedSpearItemJson),
  makeParsedItemContentEntry("taser", taserItemJson),
  makeParsedItemContentEntry("drone_shooter", droneShooterItemJson),
  makeParsedItemContentEntry("zombie_sword", zombieSwordItemJson),
  makeParsedItemContentEntry("saboteur_sword", saboteurSwordItemJson),
  makeParsedItemContentEntry("wood", woodItemJson),
  makeParsedItemContentEntry("stone", stoneItemJson),
  makeParsedItemContentEntry("food", foodItemJson),
  makeParsedItemContentEntry("gun_mag", gunMagItemJson),
  makeParsedItemContentEntry("crossbow_mag", crossbowMagItemJson),
  makeParsedItemContentEntry("wall", wallItemJson),
  makeParsedItemContentEntry("cannon", cannonItemJson),
  makeParsedItemContentEntry("crafting_station", craftingStationItemJson),
  makeParsedItemContentEntry("landmine", landmineItemJson),
] as const;

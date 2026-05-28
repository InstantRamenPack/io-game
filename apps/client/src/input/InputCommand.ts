import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type InputCommand =
  | { type: "openChat" }
  | { type: "openChatSlash" }
  | { type: "toggleSectorFeed" }
  | { type: "toggleCraftingMenu" }
  | { type: "toggleInventory" }
  | { type: "closeCraftingMenu" }
  | { type: "closeInventory" }
  | { type: "closeChest" }
  | { type: "closeHubTower" }
  | { type: "moveCraftSelection"; delta: number }
  | { type: "queueSelectedCraft" }
  | { type: "selectHotbarOrdinal"; ordinal: number }
  | { type: "dropSelectedItem"; dropWholeStack: boolean }
  | { type: "pickupNearestItem" }
  | { type: "startRepairHold" }
  | { type: "cancelRepairHold" }
  | { type: "repairTower"; towerId: number }
  | { type: "openChest"; chestEntityId: number }
  | { type: "useConsumable"; typeId: ResourceId }
  | { type: "startUseItemHold" }
  | { type: "cancelUseItemHold" };

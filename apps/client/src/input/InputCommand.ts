export type InputCommand =
  | { type: "openChat" }
  | { type: "openChatSlash" }
  | { type: "toggleSectorFeed" }
  | { type: "toggleCraftingMenu" }
  | { type: "toggleInventory" }
  | { type: "closeCraftingMenu" }
  | { type: "closeInventory" }
  | { type: "closeChest" }
  | { type: "moveCraftSelection"; delta: number }
  | { type: "queueSelectedCraft" }
  | { type: "selectHotbarOrdinal"; ordinal: number }
  | { type: "dropSelectedItem"; dropWholeStack: boolean }
  | { type: "pickupNearestItem" }
  | { type: "startRecycleHold" }
  | { type: "cancelRecycleHold" }
  | { type: "recycleItem" }
  | { type: "startRepairHold" }
  | { type: "cancelRepairHold" }
  | { type: "repairTower"; towerId: number }
  | { type: "openChest"; chestEntityId: number }
  | { type: "openCraftingMenu" };

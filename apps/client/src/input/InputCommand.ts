export type InputCommand =
  | { type: "openChat" }
  | { type: "openChatSlash" }
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
  | { type: "recycleItem" };

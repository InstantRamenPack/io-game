import type { SessionUiMode } from "@client/app/session/SessionUiStore.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
export type InputContext = {
  sessionMode: SessionUiMode;
  chatOpen: boolean;
  inventoryOpen: boolean;
  craftingOpen: boolean;
  chestOpen: boolean;
  textEntryActive: boolean;
  nearRecyclerWithItem: boolean;
  nearPickup: boolean;
  nearChest: number | null;
  nearCraftingStation: boolean;
  nearDamagedTower: number | null;
  selectedUsableTypeId: ResourceId | null;
};

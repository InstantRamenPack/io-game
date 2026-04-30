import type { SessionUiMode } from "@client/app/session/SessionUiStore.ts";

export type InputContext = {
  sessionMode: SessionUiMode;
  chatOpen: boolean;
  inventoryOpen: boolean;
  craftingOpen: boolean;
  chestOpen: boolean;
  textEntryActive: boolean;
  nearRecyclerWithItem: boolean;
};

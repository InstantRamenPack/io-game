import { interactionsConfig } from "@shared/config/gameplayConfig.ts";

export const HOTBAR_SLOT_COUNT = interactionsConfig.hotbarSlotCount;
export const MAX_HOTBAR_INDEX = HOTBAR_SLOT_COUNT - 1;

export const BUILD_PLACEMENT_MAX_DISTANCE =
  interactionsConfig.buildPlacementMaxDistance;
export const CRAFTING_STATION_INTERACT_PADDING =
  interactionsConfig.craftingStationInteractPadding;
export const CRAFTING_STATION_QUERY_RADIUS =
  interactionsConfig.craftingStationQueryRadius;

export const MAX_CHAT_MESSAGE_LENGTH = interactionsConfig.maxChatMessageLength;

export const CHEST_INTERACT_PADDING = interactionsConfig.chestInteractPadding;
export const CHEST_INTERACT_RADIUS = interactionsConfig.chestInteractRadius;
export const CHEST_SLOT_COUNT = interactionsConfig.chestSlotCount;
export const MAX_CHEST_INDEX = CHEST_SLOT_COUNT - 1;

export const RECYCLER_INTERACT_PADDING =
  interactionsConfig.recyclerInteractPadding;
export const TOWER_INTERACT_PADDING = interactionsConfig.towerInteractPadding;
export const INTERACT_HOLD_DURATION_MS =
  interactionsConfig.interactHoldDurationMs;

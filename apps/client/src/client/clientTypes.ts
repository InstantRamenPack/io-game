import type { Texture } from "pixi.js";
import type { MovementSuppressionReason } from "@client/input/MovementSuppressionReason.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { CraftTargetInput } from "@shared/net/protocol.ts";

export type PerformanceRateState = {
  frameRate: number | null;
  tickRate: number | null;
};

export type PointerInput = {
  kind: "down" | "move" | "up";
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  shiftKey: boolean;
};

export type GameClientHudApi = {
  renderer: {
    getItemTexture(typeId: string): Texture;
  };
  gameConfig: {
    tickRate: number;
  };
  worldState?:
    | {
        latestTick?: number;
        latestSnapshotReceivedAt?: number;
      }
    | undefined;
  queueInventoryMove(fromSlotIndex: number, toSlotIndex: number): void;
  queueSelectHotbarIndex(index: number): void;
  queueCraftItem(itemTypeId: ResourceId, target?: CraftTargetInput): void;
  queueBuildPlacement(x: number, y: number): void;
  queueChestMove(
    chestEntityId: number,
    fromSource: "hotbar" | "chest",
    fromIndex: number,
    toSource: "hotbar" | "chest",
    toIndex: number,
  ): void;
  queueArmorMove(
    fromSource: "hotbar" | "armor",
    fromIndex: number,
    toSource: "hotbar" | "armor",
    toIndex: number,
  ): void;
  queueUseConsumable(typeId: ResourceId): void;
  queueRecycleHotbarIndex(index: number): void;
  stopHoldFire(): void;
  setMovementSuppression(
    reason: MovementSuppressionReason,
    suppressed: boolean,
  ): void;
  getMeasuredRates(): PerformanceRateState;
  getEffectiveSimulationTickRate(): number;
};

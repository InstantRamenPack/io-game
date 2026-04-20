import type { Texture } from "pixi.js";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

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
  queueCraftItem(itemTypeId: ResourceId): void;
  queueBuildPlacement(x: number, y: number): void;
  stopHoldFire(): void;
  setMovementSuppressed(suppressed: boolean): void;
  getMeasuredRates(): PerformanceRateState;
};

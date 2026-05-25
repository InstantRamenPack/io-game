import type { InputManager } from "@client/input/InputManager.ts";
import type { WsClient } from "@client/net/WsClient.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

type DispatcherOptions = {
  networkClient: WsClient;
  inputManager: InputManager;
  isSessionReady: () => boolean;
  isTransportConnected: () => boolean;
};

export class ClientActionDispatcher {
  constructor(private readonly options: DispatcherOptions) {}

  public queueAttack(theta: number): void {
    this.sendAction({
      action: "attack",
      theta,
    });
  }

  public queueCraftItem(itemTypeId: ResourceId): void {
    this.sendAction({
      action: "craft",
      craft: { itemTypeId },
    });
  }

  public queueBuildPlacement(x: number, y: number): void {
    this.sendAction({
      action: "build",
      build: { x, y },
    });
  }

  public queueInventoryMove(fromSlotIndex: number, toSlotIndex: number): void {
    this.sendAction({
      action: "inventoryMove",
      inventoryMove: {
        fromSlotIndex,
        toSlotIndex,
      },
    });
  }

  public queueChestMove(
    chestEntityId: number,
    fromSource: "hotbar" | "chest",
    fromIndex: number,
    toSource: "hotbar" | "chest",
    toIndex: number,
  ): void {
    this.sendAction({
      action: "chestMove",
      chestMove: { chestEntityId, fromSource, fromIndex, toSource, toIndex },
    });
  }

  public queueArmorMove(
    fromSource: "hotbar" | "armor",
    fromIndex: number,
    toSource: "hotbar" | "armor",
    toIndex: number,
  ): void {
    this.sendAction({
      action: "armorMove",
      armorMove: { fromSource, fromIndex, toSource, toIndex },
    });
  }

  public queueSelectHotbarIndex(index: number): void {
    this.sendAction({
      action: "selectHotbar",
      index,
    });
  }

  public queueDropSelectedItem(dropWholeStack: boolean): void {
    this.sendAction({
      action: "drop",
      dropWholeStack,
    });
  }

  public queuePickupNearbyItem(): void {
    this.sendAction({
      action: "pickup",
    });
  }

  public queueRecycle(): void {
    this.sendAction({
      action: "recycle",
    });
  }

  public queueRepairTower(towerId: number): void {
    this.sendAction({
      action: "repair_tower",
      towerId,
    });
  }

  public queueUseConsumable(typeId: ResourceId): void {
    this.sendAction({
      action: "useConsumable",
      typeId,
    });
  }

  public requestRespawn(): void {
    if (!this.canSend()) {
      return;
    }
    this.options.networkClient.sendRespawn();
  }

  public sendChat(text: string): void {
    if (!this.canSend()) {
      return;
    }
    this.options.networkClient.sendChat(text);
  }

  private sendAction(
    payload:
      | { action: "attack"; theta: number }
      | { action: "craft"; craft: { itemTypeId: ResourceId } }
      | { action: "build"; build: { x: number; y: number } }
      | {
          action: "inventoryMove";
          inventoryMove: { fromSlotIndex: number; toSlotIndex: number };
        }
      | { action: "selectHotbar"; index: number }
      | {
          action: "armorMove";
          armorMove: {
            fromSource: "hotbar" | "armor";
            fromIndex: number;
            toSource: "hotbar" | "armor";
            toIndex: number;
          };
        }
      | {
          action: "chestMove";
          chestMove: {
            chestEntityId: number;
            fromSource: "hotbar" | "chest";
            fromIndex: number;
            toSource: "hotbar" | "chest";
            toIndex: number;
          };
        }
      | { action: "drop"; dropWholeStack: boolean }
      | { action: "pickup" }
      | { action: "recycle" }
      | { action: "repair_tower"; towerId: number }
      | { action: "useConsumable"; typeId: ResourceId },
  ): void {
    if (!this.canSend()) {
      return;
    }

    this.options.networkClient.sendAction({
      t: "action",
      seq: this.options.inputManager.nextSequence(),
      ...payload,
    });
  }

  private canSend(): boolean {
    return this.options.isSessionReady() && this.options.isTransportConnected();
  }
}

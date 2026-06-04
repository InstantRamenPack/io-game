import type { InputContext } from "@client/input/InputContext.ts";
import type { InputCommand } from "@client/input/InputCommand.ts";
import { INTERACT_HOLD_DURATION_MS } from "@shared/gameplay/constants.ts";

type RouterOptions = {
  getContext: () => InputContext;
  dispatch: (command: InputCommand) => void;
};

export class GameInputRouter {
  private eItemHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private eItemHoldFired = false;
  private rRepairHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private rRepairHoldFired = false;
  private rRepairHoldTowerId: number | null = null;

  constructor(private readonly options: RouterOptions) {}

  public bind(target: Window): void {
    target.addEventListener("keydown", (event) => this.onKeyDown(event));
    target.addEventListener("keyup", (event) => this.onKeyUp(event));
  }

  private onKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (key === "e") {
      if (this.eItemHoldTimer !== null) {
        clearTimeout(this.eItemHoldTimer);
        this.eItemHoldTimer = null;
        if (!this.eItemHoldFired) {
          this.options.dispatch({ type: "cancelUseItemHold" });
        }
      }
      this.eItemHoldFired = false;
    }

    if (key === "r") {
      if (this.rRepairHoldTimer !== null) {
        clearTimeout(this.rRepairHoldTimer);
        this.rRepairHoldTimer = null;
      }
      if (!this.rRepairHoldFired) {
        this.options.dispatch({ type: "cancelRepairHold" });
      }
      this.rRepairHoldFired = false;
      this.rRepairHoldTowerId = null;
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    const context = this.options.getContext();
    if (context.textEntryActive || context.chatOpen) {
      return;
    }

    const gameplayActive = context.sessionMode === "playing";
    if (!gameplayActive) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "enter") {
      if (context.craftingOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "queueSelectedCraft" });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.options.dispatch({ type: "openChat" });
      return;
    }

    if (key === "/") {
      event.preventDefault();
      event.stopPropagation();
      this.options.dispatch({ type: "openChatSlash" });
      return;
    }

    if (key === "t") {
      event.preventDefault();
      event.stopPropagation();
      this.options.dispatch({ type: "openChat" });
      return;
    }

    if (event.code === "Backquote") {
      event.preventDefault();
      event.stopPropagation();
      this.options.dispatch({ type: "toggleSectorFeed" });
      return;
    }

    if (key === "c") {
      event.preventDefault();
      this.options.dispatch({
        type: context.craftingOpen ? "closeCraftingMenu" : "toggleCraftingMenu",
      });
      return;
    }

    if (key === "e") {
      event.preventDefault();
      if (context.craftingOpen || context.chestOpen) {
        this.options.dispatch({ type: "closeHubTower" });
        return;
      }
      if (context.nearPickup) {
        this.options.dispatch({ type: "pickupNearestItem" });
        return;
      }
      if (context.nearChest !== null) {
        this.options.dispatch({
          type: "openChest",
          chestEntityId: context.nearChest,
        });
        return;
      }
      if (context.selectedUsableTypeId !== null) {
        this.eItemHoldFired = false;
        const typeId = context.selectedUsableTypeId;
        this.options.dispatch({ type: "startUseItemHold" });
        this.eItemHoldTimer = setTimeout(() => {
          this.eItemHoldTimer = null;
          this.eItemHoldFired = true;
          this.options.dispatch({ type: "useConsumable", typeId });
        }, INTERACT_HOLD_DURATION_MS);
        return;
      }
      this.options.dispatch({ type: "pickupNearestItem" });
      return;
    }

    if (key === "r") {
      event.preventDefault();
      if (context.nearDamagedTower !== null) {
        if (this.rRepairHoldTimer !== null) {
          clearTimeout(this.rRepairHoldTimer);
        }
        this.rRepairHoldFired = false;
        this.rRepairHoldTowerId = context.nearDamagedTower;
        this.options.dispatch({ type: "startRepairHold" });
        this.rRepairHoldTimer = setTimeout(() => {
          this.rRepairHoldTimer = null;
          this.rRepairHoldFired = true;
          if (this.rRepairHoldTowerId !== null) {
            this.options.dispatch({
              type: "repairTower",
              towerId: this.rRepairHoldTowerId,
            });
          }
          this.rRepairHoldTowerId = null;
        }, INTERACT_HOLD_DURATION_MS);
      }
      return;
    }

    if (key === "h") {
      event.preventDefault();
      if (context.chestOpen || context.craftingOpen) {
        this.options.dispatch({ type: "closeHubTower" });
        return;
      }
      this.options.dispatch({
        type: context.inventoryOpen ? "closeInventory" : "toggleInventory",
      });
      return;
    }

    if (key === "q") {
      event.preventDefault();
      this.options.dispatch({
        type: "dropSelectedItem",
        dropWholeStack: event.ctrlKey,
      });
      return;
    }

    if (key === "r") {
      event.preventDefault();
      this.options.dispatch({ type: "reloadSelectedWeapon" });
      return;
    }

    if (key === "escape") {
      if (context.chestOpen || context.craftingOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "closeHubTower" });
        return;
      }

      if (context.inventoryOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "closeInventory" });
      }
      return;
    }

    if (context.craftingOpen) {
      if (key === "arrowup") {
        event.preventDefault();
        this.options.dispatch({ type: "moveCraftSelection", delta: -1 });
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        this.options.dispatch({ type: "moveCraftSelection", delta: 1 });
        return;
      }

      return;
    }

    const digitMatch = /^Digit([0-9])$/.exec(event.code);
    if (!digitMatch) {
      return;
    }

    const rawDigit = Number(digitMatch[1]);
    const ordinal = rawDigit === 0 ? 10 : rawDigit;
    event.preventDefault();
    this.options.dispatch({ type: "selectHotbarOrdinal", ordinal });
  }
}

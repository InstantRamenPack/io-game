import type { InputContext } from "@client/input/InputContext.ts";
import type { InputCommand } from "@client/input/InputCommand.ts";

type RouterOptions = {
  getContext: () => InputContext;
  dispatch: (command: InputCommand) => void;
};

const RECYCLE_HOLD_DURATION_MS = 750;
const REPAIR_HOLD_DURATION_MS = 750;
const USE_ITEM_HOLD_DURATION_MS = 750;

export class GameInputRouter {
  private eHoldInterval: ReturnType<typeof setInterval> | null = null;
  private eHoldFired = false;
  private eKeyHeld = false;
  private eNextRecycleAtMs: number | null = null;
  private eItemHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private eItemHoldFired = false;
  private fHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private fHoldFired = false;
  private fHoldTowerId: number | null = null;

  constructor(private readonly options: RouterOptions) {}

  public bind(target: Window): void {
    target.addEventListener("keydown", (event) => this.onKeyDown(event));
    target.addEventListener("keyup", (event) => this.onKeyUp(event));
  }

  private onKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (key === "e") {
      this.eKeyHeld = false;
      this.stopRecycleLoop();
      this.options.dispatch({ type: "cancelRecycleHold" });
      this.eHoldFired = false;
      this.eNextRecycleAtMs = null;
      if (this.eItemHoldTimer !== null) {
        clearTimeout(this.eItemHoldTimer);
        this.eItemHoldTimer = null;
        if (!this.eItemHoldFired) {
          this.options.dispatch({ type: "cancelUseItemHold" });
        }
      }
      this.eItemHoldFired = false;
      return;
    }

    if (key === "f") {
      if (this.fHoldTimer !== null) {
        clearTimeout(this.fHoldTimer);
        this.fHoldTimer = null;
      }
      if (!this.fHoldFired) {
        this.options.dispatch({ type: "cancelRepairHold" });
      }
      this.fHoldFired = false;
      this.fHoldTowerId = null;
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
      if (context.chestOpen) {
        this.options.dispatch({ type: "closeChest" });
        return;
      }
      if (context.craftingOpen) {
        this.options.dispatch({ type: "closeCraftingMenu" });
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
      if (context.nearCraftingStation && !context.craftingOpen) {
        this.options.dispatch({ type: "openCraftingMenu" });
        return;
      }
      if (context.nearRecyclerWithItem) {
        this.eKeyHeld = true;
        this.startRecycleLoop();
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
        }, USE_ITEM_HOLD_DURATION_MS);
        return;
      }
      this.options.dispatch({ type: "pickupNearestItem" });
      return;
    }

    if (key === "f") {
      const towerId = context.nearDamagedTower;
      if (towerId !== null) {
        event.preventDefault();
        if (this.fHoldTimer !== null) {
          clearTimeout(this.fHoldTimer);
        }
        this.fHoldFired = false;
        this.fHoldTowerId = towerId;
        this.options.dispatch({ type: "startRepairHold" });
        this.fHoldTimer = setTimeout(() => {
          this.fHoldTimer = null;
          this.fHoldFired = true;
          if (this.fHoldTowerId !== null) {
            this.options.dispatch({
              type: "repairTower",
              towerId: this.fHoldTowerId,
            });
          }
          this.fHoldTowerId = null;
        }, REPAIR_HOLD_DURATION_MS);
      }
      return;
    }

    if (key === "h") {
      event.preventDefault();
      if (context.chestOpen) {
        this.options.dispatch({ type: "closeChest" });
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

    if (key === "escape") {
      if (context.chestOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "closeChest" });
        return;
      }

      if (context.inventoryOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "closeInventory" });
        return;
      }

      if (context.craftingOpen) {
        event.preventDefault();
        this.options.dispatch({ type: "closeCraftingMenu" });
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

  private startRecycleLoop(): void {
    const context = this.options.getContext();
    const nowMs = performance.now();
    if (!context.nearRecyclerWithItem) {
      this.options.dispatch({ type: "cancelRecycleHold" });
      this.eNextRecycleAtMs = null;
      return;
    }
    if (this.eNextRecycleAtMs === null) {
      this.eNextRecycleAtMs = nowMs + RECYCLE_HOLD_DURATION_MS;
      this.eHoldFired = false;
      this.options.dispatch({ type: "startRecycleHold" });
    }
    if (this.eHoldInterval !== null) {
      return;
    }

    this.eHoldInterval = setInterval(() => {
      if (!this.eKeyHeld) {
        this.stopRecycleLoop();
        return;
      }

      const tickContext = this.options.getContext();
      if (!tickContext.nearRecyclerWithItem) {
        this.options.dispatch({ type: "cancelRecycleHold" });
        this.stopRecycleLoop();
        return;
      }

      const tickNowMs = performance.now();
      if (this.eNextRecycleAtMs === null || tickNowMs < this.eNextRecycleAtMs) {
        return;
      }

      this.eHoldFired = true;
      this.options.dispatch({ type: "recycleItem" });

      if (!this.eKeyHeld) {
        this.stopRecycleLoop();
        return;
      }

      this.eNextRecycleAtMs += RECYCLE_HOLD_DURATION_MS;
      this.eHoldFired = false;
      this.options.dispatch({ type: "startRecycleHold" });
    }, 16);
  }

  private stopRecycleLoop(): void {
    if (this.eHoldInterval !== null) {
      clearInterval(this.eHoldInterval);
      this.eHoldInterval = null;
    }
    this.eNextRecycleAtMs = null;
  }
}

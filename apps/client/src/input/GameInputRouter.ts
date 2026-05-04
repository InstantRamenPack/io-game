import type { InputContext } from "@client/input/InputContext.ts";
import type { InputCommand } from "@client/input/InputCommand.ts";

type RouterOptions = {
  getContext: () => InputContext;
  dispatch: (command: InputCommand) => void;
};

const RECYCLE_HOLD_DURATION_MS = 750;

export class GameInputRouter {
  private eHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private eHoldFired = false;

  constructor(private readonly options: RouterOptions) {}

  public bind(target: Window): void {
    target.addEventListener("keydown", (event) => this.onKeyDown(event));
    target.addEventListener("keyup", (event) => this.onKeyUp(event));
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== "e") {
      return;
    }
    if (this.eHoldTimer !== null) {
      clearTimeout(this.eHoldTimer);
      this.eHoldTimer = null;
    }
    if (!this.eHoldFired) {
      this.options.dispatch({ type: "cancelRecycleHold" });
    }
    this.eHoldFired = false;
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

    if (key === "c") {
      event.preventDefault();
      this.options.dispatch({
        type: context.craftingOpen ? "closeCraftingMenu" : "toggleCraftingMenu",
      });
      return;
    }

    if (key === "e") {
      event.preventDefault();
      if (!context.nearPickup && context.nearRecyclerWithItem) {
        if (this.eHoldTimer !== null) {
          clearTimeout(this.eHoldTimer);
        }
        this.eHoldFired = false;
        this.options.dispatch({ type: "startRecycleHold" });
        this.eHoldTimer = setTimeout(() => {
          this.eHoldTimer = null;
          this.eHoldFired = true;
          this.options.dispatch({ type: "recycleItem" });
        }, RECYCLE_HOLD_DURATION_MS);
        return;
      }
      this.options.dispatch({ type: "pickupNearestItem" });
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
}

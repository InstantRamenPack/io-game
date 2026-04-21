import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";

/**
 * Installs the top-level gameplay hotkeys that are only meaningful while the
 * in-game shell is visible. The handler intentionally speaks to the HUD
 * controller in semantic actions instead of mutating UI state directly.
 */
export function installGameHotkeys(
  elements: AppElements,
  hudController: HudController,
): void {
  window.addEventListener("keydown", (event) => {
    if (event.repeat || elements.menuRoot?.style.display !== "none") {
      return;
    }

    const activeTag = document.activeElement?.tagName;
    if (
      activeTag === "INPUT" ||
      activeTag === "SELECT" ||
      activeTag === "TEXTAREA"
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      hudController.toggleCraftingMenu();
      return;
    }

    if (key === "e") {
      event.preventDefault();
      hudController.toggleInventory();
      return;
    }

    if (hudController.isInventoryOpen()) {
      if (key === "escape") {
        event.preventDefault();
        hudController.toggleInventory();
        return;
      }

      const digitMatch = /^Digit([0-9])$/.exec(event.code);
      if (digitMatch) {
        const rawDigit = Number(digitMatch[1]);
        const ordinal = rawDigit === 0 ? 10 : rawDigit;
        event.preventDefault();
        hudController.selectHotbarItemByOrdinal(ordinal);
      }
      return;
    }

    if (hudController.isCraftingMenuOpen()) {
      if (key === "escape") {
        event.preventDefault();
        hudController.toggleCraftingMenu();
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        hudController.moveCraftSelection(-1);
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        hudController.moveCraftSelection(1);
        return;
      }

      if (key === "enter" || key === " ") {
        event.preventDefault();
        hudController.queueSelectedCraft();
      }
      return;
    }

    const digitMatch = /^Digit([0-9])$/.exec(event.code);
    if (digitMatch) {
      const rawDigit = Number(digitMatch[1]);
      const ordinal = rawDigit === 0 ? 10 : rawDigit;
      event.preventDefault();
      hudController.selectHotbarItemByOrdinal(ordinal);
      return;
    }
  });
}

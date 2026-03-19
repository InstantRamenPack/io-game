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
    if (key === "b") {
      hudController.toggleBuildMenu();
      return;
    }

    if (key === "c") {
      hudController.toggleCraftingMenu();
      return;
    }

    if (
      (hudController.isBuildMenuOpen() || hudController.isCraftingMenuOpen()) &&
      ["1", "2", "3", "4"].includes(key)
    ) {
      hudController.selectBuildByOrdinal(Number(key));
      return;
    }

    if (
      hudController.isCraftingMenuOpen() &&
      (key === "enter" || key === " ")
    ) {
      hudController.queueSelectedCraft();
    }
  });
}

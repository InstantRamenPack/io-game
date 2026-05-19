import type { AppElements } from "@client/app/AppElements.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";

export type MenuController = {
  showGameScreen(): void;
  showMenuScreen(): void;
};

type MenuControllerOptions = {
  elements: AppElements;
  sessionUiController: SessionUiController;
};

export function createMenuController({
  sessionUiController,
}: MenuControllerOptions): MenuController {
  return {
    showGameScreen(): void {
      sessionUiController.showPlaying();
    },
    showMenuScreen(): void {
      sessionUiController.showMenu();
    },
  };
}

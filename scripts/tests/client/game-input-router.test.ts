import { describe, expect, test } from "bun:test";
import type { InputCommand } from "@client/input/InputCommand.ts";
import type { InputContext } from "@client/input/InputContext.ts";
import { GameInputRouter } from "@client/input/GameInputRouter.ts";

function makePlayingContext(): InputContext {
  return {
    sessionMode: "playing",
    chatOpen: false,
    inventoryOpen: false,
    craftingOpen: false,
    chestOpen: false,
    textEntryActive: false,
    nearPickup: false,
    nearChest: null,
    nearCraftingStation: false,
    nearDamagedTower: null,
    selectedUsableTypeId: null,
  };
}

describe("game input router", () => {
  test("pressing R requests a manual reload in active gameplay", () => {
    const commands: InputCommand[] = [];
    const router = new GameInputRouter({
      getContext: makePlayingContext,
      dispatch: (command) => commands.push(command),
    });
    const event = {
      key: "r",
      code: "KeyR",
      repeat: false,
      preventDefault() {},
      stopPropagation() {},
    } as KeyboardEvent;

    (
      router as unknown as {
        onKeyDown(event: KeyboardEvent): void;
      }
    ).onKeyDown(event);

    expect(commands).toEqual([{ type: "reloadSelectedWeapon" }]);
  });
});

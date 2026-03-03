import type { InputCommand } from "@shared/net/protocol.ts";

/** Collects keyboard input and serializes movement commands. */
export class InputManager {
  commandSequence = 1;
  moveX = 0;
  moveY = 0;
  private readonly pressedKeys = new Set<string>();

  /** Binds WASD key handlers on the provided event target. */
  bind(targetElement: HTMLElement | Window): void {
    targetElement.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      this.pressedKeys.add(keyboardEvent.key.toLowerCase());
      this.recomputeMovementVector();
    });

    targetElement.addEventListener("keyup", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      this.pressedKeys.delete(keyboardEvent.key.toLowerCase());
      this.recomputeMovementVector();
    });

    targetElement.addEventListener("blur", () => {
      this.pressedKeys.clear();
      this.recomputeMovementVector();
    });
  }

  /** Builds the next movement command payload for the server tick. */
  toCommand(serverTick: number): InputCommand {
    return {
      seq: this.commandSequence++,
      tick: serverTick,
      moveX: this.moveX,
      moveY: this.moveY,
    };
  }

  /** No-op hook kept for parity with earlier one-shot input designs. */
  clearOneShots(): void {
    // No one-shot inputs in WASD-only mode.
  }

  /** Recomputes the movement vector from currently pressed keys. */
  private recomputeMovementVector(): void {
    const moveLeft = this.pressedKeys.has("a") ? -1 : 0;
    const moveRight = this.pressedKeys.has("d") ? 1 : 0;
    const moveUp = this.pressedKeys.has("w") ? -1 : 0;
    const moveDown = this.pressedKeys.has("s") ? 1 : 0;

    this.moveX = moveLeft + moveRight;
    this.moveY = moveUp + moveDown;
  }
}

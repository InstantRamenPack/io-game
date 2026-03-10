import type { InputCommand } from "@shared/net/protocol.ts";

/**
 * Collects keyboard input and serializes movement commands.
 * This remains focused on local input capture rather than gameplay decisions.
 */
export class InputManager {
  commandSequence = 1;
  moveX = 0;
  moveY = 0;
  private readonly pressedKeys = new Set<string>();

  /**
   * Binds WASD key handlers on the provided event target.
   * @param targetElement Window or element that should receive keyboard events.
   */
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

  /**
   * Builds the next movement command payload for the server tick.
   * @param serverTick Latest authoritative tick known by the client.
   * @returns Serialized input command for transmission.
   */
  toCommand(serverTick: number): InputCommand {
    return {
      seq: this.commandSequence++,
      tick: serverTick,
      moveX: this.moveX,
      moveY: this.moveY,
    };
  }

  /**
   * Clears one-shot inputs when they exist.
   * This is currently a no-op because movement is the only active input family.
   */
  clearOneShots(): void {
    // No one-shot inputs in WASD-only mode.
  }

  /**
   * Recomputes the movement vector from the currently pressed keys.
   */
  private recomputeMovementVector(): void {
    const moveLeft = this.pressedKeys.has("a") ? -1 : 0;
    const moveRight = this.pressedKeys.has("d") ? 1 : 0;
    const moveUp = this.pressedKeys.has("w") ? -1 : 0;
    const moveDown = this.pressedKeys.has("s") ? 1 : 0;

    this.moveX = moveLeft + moveRight;
    this.moveY = moveUp + moveDown;
  }
}

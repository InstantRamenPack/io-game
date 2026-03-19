import type { RecipeId } from "@shared/content/types.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InputCommand } from "@shared/net/protocol.ts";

type AttackTarget = {
  x: number;
  y: number;
};

type BuildPlacement = {
  itemTypeId: ResourceId;
  x: number;
  y: number;
};

/**
 * Collects keyboard input and serializes movement commands.
 * This remains focused on local input capture rather than gameplay decisions.
 */
export class InputManager {
  public commandSequence = 1;
  public moveX = 0;
  public moveY = 0;
  public pendingAttack?: AttackTarget;
  public pendingCraft?: { recipeId: RecipeId };
  public pendingBuild?: BuildPlacement;
  public pendingSelectSlot?: number;
  private readonly pressedKeys = new Set<string>();

  /**
   * Binds WASD key handlers on the provided event target.
   * @param targetElement Window or element that should receive keyboard events.
   */
  public bind(targetElement: HTMLElement | Window): void {
    targetElement.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      const slotIndex = this.parseSlotDigit(keyboardEvent.code);
      if (slotIndex !== null) {
        this.pendingSelectSlot = slotIndex;
        return;
      }

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
  public toCommand(serverTick: number): InputCommand {
    return {
      seq: this.commandSequence++,
      tick: serverTick,
      moveX: this.moveX,
      moveY: this.moveY,
      selectSlot: this.pendingSelectSlot,
      attack: this.pendingAttack ? { ...this.pendingAttack } : undefined,
      craft: this.pendingCraft ? { ...this.pendingCraft } : undefined,
      build: this.pendingBuild ? { ...this.pendingBuild } : undefined,
    };
  }

  /**
   * Clears one-shot inputs after they have been sent.
   */
  public clearOneShots(): void {
    this.pendingAttack = undefined;
    this.pendingCraft = undefined;
    this.pendingBuild = undefined;
    this.pendingSelectSlot = undefined;
  }

  public queueAttack(x: number, y: number): void {
    this.clearPendingAction();
    this.pendingAttack = { x, y };
  }

  public queueCraft(recipeId: RecipeId): void {
    this.clearPendingAction();
    this.pendingCraft = { recipeId };
  }

  public queueBuild(itemTypeId: ResourceId, x: number, y: number): void {
    this.clearPendingAction();
    this.pendingBuild = { itemTypeId, x, y };
  }

  private clearPendingAction(): void {
    this.pendingAttack = undefined;
    this.pendingCraft = undefined;
    this.pendingBuild = undefined;
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

  private parseSlotDigit(code: string): number | null {
    const match = /^Digit([1-9])$/.exec(code);
    if (!match) {
      return null;
    }

    return Number(match[1]) - 1;
  }
}

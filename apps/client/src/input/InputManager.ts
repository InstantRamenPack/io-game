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
  public pendingCraft?: { itemTypeId: ResourceId };
  public pendingBuild?: BuildPlacement;
  public pendingSelectWeaponIndex?: number;
  private holdFireTarget?: AttackTarget;
  private readonly pressedKeys = new Set<string>();

  /**
   * Binds WASD key handlers on the provided event target.
   * @param targetElement Window or element that should receive keyboard events.
   */
  public bind(targetElement: HTMLElement | Window): void {
    targetElement.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (this.isTextInputTarget(keyboardEvent.target)) {
        return;
      }
      const slotIndex = this.parseSlotDigit(keyboardEvent.code);
      if (slotIndex !== null) {
        this.pendingSelectWeaponIndex = slotIndex;
        return;
      }

      this.pressedKeys.add(keyboardEvent.key.toLowerCase());
      this.recomputeMovementVector();
    });

    targetElement.addEventListener("keyup", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (this.isTextInputTarget(keyboardEvent.target)) {
        return;
      }
      this.pressedKeys.delete(keyboardEvent.key.toLowerCase());
      this.recomputeMovementVector();
    });

    targetElement.addEventListener("blur", () => {
      this.pressedKeys.clear();
      this.holdFireTarget = undefined;
      this.recomputeMovementVector();
    });
  }

  /**
   * Builds the next movement command payload for the server tick.
   * @param serverTick Latest authoritative tick known by the client.
   * @returns Serialized input command for transmission.
   */
  public toCommand(serverTick: number): InputCommand {
    const attack = this.holdFireTarget
      ? { ...this.holdFireTarget }
      : this.pendingAttack
        ? { ...this.pendingAttack }
        : undefined;
    return {
      seq: this.commandSequence++,
      tick: serverTick,
      moveX: this.moveX,
      moveY: this.moveY,
      selectWeaponIndex: this.pendingSelectWeaponIndex,
      attack,
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
    this.pendingSelectWeaponIndex = undefined;
  }

  public startHoldFire(x: number, y: number): void {
    this.clearPendingAction();
    this.holdFireTarget = { x, y };
  }

  public updateHoldFireTarget(x: number, y: number): void {
    if (this.holdFireTarget) {
      this.holdFireTarget = { x, y };
    }
  }

  public stopHoldFire(): void {
    this.holdFireTarget = undefined;
  }

  public queueAttack(x: number, y: number): void {
    this.clearPendingAction();
    this.pendingAttack = { x, y };
  }

  public queueCraft(itemTypeId: ResourceId): void {
    this.clearPendingAction();
    this.pendingCraft = { itemTypeId };
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

  private isTextInputTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }
}

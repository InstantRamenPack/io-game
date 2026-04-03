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
  private movementSuppressed = false;

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
      const key = keyboardEvent.key.toLowerCase();
      if (this.movementSuppressed && this.isMovementKey(key)) {
        return;
      }

      this.pressedKeys.add(key);
      this.recomputeMovementVector();
    });

    targetElement.addEventListener("keyup", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (this.isTextInputTarget(keyboardEvent.target)) {
        return;
      }
      const key = keyboardEvent.key.toLowerCase();
      this.pressedKeys.delete(key);
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

  public queueSelectWeaponIndex(index: number): void {
    this.pendingSelectWeaponIndex = index;
  }

  public clearPendingWeaponSelection(): void {
    this.pendingSelectWeaponIndex = undefined;
  }

  public setMovementSuppressed(suppressed: boolean): void {
    if (this.movementSuppressed === suppressed) {
      return;
    }

    this.movementSuppressed = suppressed;
    if (suppressed) {
      this.pressedKeys.clear();
      this.recomputeMovementVector();
    }
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
    if (this.movementSuppressed) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    const moveLeft =
      this.pressedKeys.has("a") || this.pressedKeys.has("arrowleft") ? -1 : 0;
    const moveRight =
      this.pressedKeys.has("d") || this.pressedKeys.has("arrowright") ? 1 : 0;
    const moveUp =
      this.pressedKeys.has("w") || this.pressedKeys.has("arrowup") ? -1 : 0;
    const moveDown =
      this.pressedKeys.has("s") || this.pressedKeys.has("arrowdown") ? 1 : 0;

    this.moveX = moveLeft + moveRight;
    this.moveY = moveUp + moveDown;
  }

  private isMovementKey(key: string): boolean {
    return (
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d" ||
      key === "arrowup" ||
      key === "arrowdown" ||
      key === "arrowleft" ||
      key === "arrowright"
    );
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

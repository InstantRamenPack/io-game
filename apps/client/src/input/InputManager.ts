import type { MoveIntentKey } from "@shared/net/protocol.ts";

type AttackTarget = {
  x: number;
  y: number;
};

type MoveIntentListener = (moveIntent: {
  key: MoveIntentKey;
  pressed: boolean;
}) => void;

const MOVE_INTENT_BY_KEY: Partial<Record<string, MoveIntentKey>> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

/**
 * Collects local keyboard and pointer hold state.
 * Networking stays outside this class so gameplay code can decide when to send.
 */
export class InputManager {
  public commandSequence = 1;

  private holdFireTarget?: AttackTarget;
  private readonly pressedKeys = new Set<string>();
  private readonly moveIntentListeners: MoveIntentListener[] = [];
  private movementSuppressed = false;

  public bind(targetElement: HTMLElement | Window): void {
    targetElement.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (this.isTextInputTarget(keyboardEvent.target)) {
        return;
      }

      const key = keyboardEvent.key.toLowerCase();
      const moveIntentKey = MOVE_INTENT_BY_KEY[key];
      if (!moveIntentKey) {
        return;
      }
      if (this.movementSuppressed) {
        return;
      }
      if (this.pressedKeys.has(key)) {
        return;
      }

      this.pressedKeys.add(key);
      this.emitMoveIntent(moveIntentKey, true);
    });

    targetElement.addEventListener("keyup", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (this.isTextInputTarget(keyboardEvent.target)) {
        return;
      }

      const key = keyboardEvent.key.toLowerCase();
      const moveIntentKey = MOVE_INTENT_BY_KEY[key];
      if (!moveIntentKey || !this.pressedKeys.has(key)) {
        return;
      }

      this.pressedKeys.delete(key);
      this.emitMoveIntent(moveIntentKey, false);
    });

    targetElement.addEventListener("blur", () => {
      this.releaseAllMovement();
      this.holdFireTarget = undefined;
    });
  }

  public onMoveIntent(listener: MoveIntentListener): void {
    this.moveIntentListeners.push(listener);
  }

  public nextSequence(): number {
    return this.commandSequence++;
  }

  public startHoldFire(x: number, y: number): void {
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

  public getHoldFireTarget(): AttackTarget | undefined {
    return this.holdFireTarget ? { ...this.holdFireTarget } : undefined;
  }

  public setMovementSuppressed(suppressed: boolean): void {
    if (this.movementSuppressed === suppressed) {
      return;
    }

    this.movementSuppressed = suppressed;
    if (suppressed) {
      this.releaseAllMovement();
    }
  }

  private emitMoveIntent(key: MoveIntentKey, pressed: boolean): void {
    for (const listener of this.moveIntentListeners) {
      listener({ key, pressed });
    }
  }

  private releaseAllMovement(): void {
    for (const key of [...this.pressedKeys]) {
      const moveIntentKey = MOVE_INTENT_BY_KEY[key];
      if (moveIntentKey) {
        this.emitMoveIntent(moveIntentKey, false);
      }
    }
    this.pressedKeys.clear();
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

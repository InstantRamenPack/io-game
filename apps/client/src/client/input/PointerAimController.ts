import type { PointerInput } from "@client/client/clientTypes.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { normalizeAngle, shortestAngleDelta } from "@shared/math/angle.ts";

type AimTarget = {
  x: number;
  y: number;
};

type PlayerPose = {
  x: number;
  y: number;
  rotation: number;
};

type BindOptions = {
  renderer: PixiRenderer;
  isStarted: () => boolean;
  getPlayerPose: () => PlayerPose | null;
  handlePointerInput: (pointer: PointerInput) => boolean;
  startHoldFire: (x: number, y: number) => void;
  updateHoldFireTarget: (x: number, y: number) => void;
  stopHoldFire: () => void;
  onAimChanged: (force: boolean) => void;
};

export class PointerAimController {
  private renderer?: PixiRenderer;
  private bindOptions?: BindOptions;
  private pointerViewTarget: HTMLCanvasElement | null = null;
  private pointerClientX: number | null = null;
  private pointerClientY: number | null = null;
  private pointerAimTarget?: AimTarget;
  private lastSentAimTheta?: number;
  private lastSentAimAtMs = Number.NEGATIVE_INFINITY;
  private bound = false;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const options = this.bindOptions;
    if (
      !options ||
      !options.isStarted() ||
      event.button !== 0 ||
      !event.isPrimary
    ) {
      return;
    }

    const aimTarget = this.capturePointer(event.clientX, event.clientY);
    const screenPoint = options.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    const handled = options.handlePointerInput({
      kind: "down",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      options.startHoldFire(aimTarget.x, aimTarget.y);
    }
    options.onAimChanged(true);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const options = this.bindOptions;
    if (!options || !options.isStarted() || !event.isPrimary) {
      return;
    }

    const aimTarget = this.capturePointer(event.clientX, event.clientY);
    const screenPoint = options.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    const handled = options.handlePointerInput({
      kind: "move",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      options.updateHoldFireTarget(aimTarget.x, aimTarget.y);
    }
    options.onAimChanged(true);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const options = this.bindOptions;
    if (!options || event.button !== 0 || !event.isPrimary) {
      return;
    }

    const aimTarget = this.capturePointer(event.clientX, event.clientY);
    const screenPoint = options.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    options.handlePointerInput({
      kind: "up",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    options.stopHoldFire();
    options.onAimChanged(true);
  };

  private readonly handlePointerViewRectInvalidation = (): void => {
    this.renderer?.invalidateViewRectCache();
  };

  public bind(options: BindOptions): void {
    this.bindOptions = options;
    this.renderer = options.renderer;
    if (this.bound) {
      return;
    }

    const view = options.renderer.getView();
    this.pointerViewTarget = view;
    view?.addEventListener("pointerdown", this.handlePointerDown);
    view?.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("resize", this.handlePointerViewRectInvalidation);
    window.addEventListener(
      "scroll",
      this.handlePointerViewRectInvalidation,
      true,
    );
    this.bound = true;
  }

  public unbind(): void {
    if (!this.bound) {
      return;
    }

    this.pointerViewTarget?.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.pointerViewTarget?.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener(
      "resize",
      this.handlePointerViewRectInvalidation,
    );
    window.removeEventListener(
      "scroll",
      this.handlePointerViewRectInvalidation,
      true,
    );
    this.pointerViewTarget = null;
    this.bound = false;
  }

  public reset(): void {
    this.pointerAimTarget = undefined;
    this.pointerClientX = null;
    this.pointerClientY = null;
    this.lastSentAimTheta = undefined;
    this.lastSentAimAtMs = Number.NEGATIVE_INFINITY;
  }

  public getAimTarget(): AimTarget | undefined {
    return this.pointerAimTarget ? { ...this.pointerAimTarget } : undefined;
  }

  public refreshPointerTargetFromScreen(): AimTarget | undefined {
    if (this.pointerClientX === null || this.pointerClientY === null) {
      return undefined;
    }

    return this.capturePointer(this.pointerClientX, this.pointerClientY);
  }

  public computeAimTheta(
    playerPose = this.bindOptions?.getPlayerPose() ?? null,
  ): number | null {
    const target = this.pointerAimTarget;
    if (!target || !playerPose) {
      return null;
    }

    const deltaX = target.x - playerPose.x;
    const deltaY = target.y - playerPose.y;
    if (Math.hypot(deltaX, deltaY) <= Number.EPSILON) {
      return null;
    }

    return normalizeAngle(Math.atan2(deltaY, deltaX));
  }

  /**
   * Computes aim theta purely from screen space: the angle from the viewport
   * center (where the local player is always rendered) to the cursor. This
   * avoids any dependency on the player's interpolated world position, so
   * server corrections never cause the local player's weapon to jitter.
   */
  public computeAimThetaFromScreen(): number | null {
    const renderer = this.renderer;
    if (
      renderer === undefined ||
      this.pointerClientX === null ||
      this.pointerClientY === null
    ) {
      return null;
    }

    const cursorWorld = renderer.screenToWorld(
      this.pointerClientX,
      this.pointerClientY,
    );
    const centerWorld = renderer.getViewportCenterWorld();
    if (!centerWorld) {
      return null;
    }

    const dx = cursorWorld.x - centerWorld.x;
    const dy = cursorWorld.y - centerWorld.y;
    if (Math.hypot(dx, dy) <= Number.EPSILON) {
      return null;
    }

    return normalizeAngle(Math.atan2(dy, dx));
  }

  public maybeGetAimToSend(options: {
    now: number;
    intervalMs: number;
    epsilon: number;
    force?: boolean;
    playerPose?: PlayerPose | null;
  }): number | null {
    const theta = this.computeAimTheta(options.playerPose);
    if (theta === null) {
      return null;
    }

    const changed =
      this.lastSentAimTheta === undefined ||
      Math.abs(shortestAngleDelta(this.lastSentAimTheta, theta)) >
        options.epsilon;
    const due = options.now - this.lastSentAimAtMs >= options.intervalMs;
    if (!changed || (!options.force && !due)) {
      return null;
    }

    this.lastSentAimTheta = theta;
    this.lastSentAimAtMs = options.now;
    return theta;
  }

  private capturePointer(clientX: number, clientY: number): AimTarget {
    this.pointerClientX = clientX;
    this.pointerClientY = clientY;
    const renderer = this.renderer;
    const playerPose = this.bindOptions?.getPlayerPose() ?? null;
    if (!renderer) {
      const target = { x: clientX, y: clientY };
      this.pointerAimTarget = target;
      return target;
    }

    const cursorWorld = renderer.screenToWorld(clientX, clientY);
    const centerWorld = renderer.getViewportCenterWorld();
    const aimTarget =
      !centerWorld || !playerPose
        ? cursorWorld
        : {
            x: playerPose.x + (cursorWorld.x - centerWorld.x),
            y: playerPose.y + (cursorWorld.y - centerWorld.y),
          };
    this.pointerAimTarget = aimTarget;
    return aimTarget;
  }
}

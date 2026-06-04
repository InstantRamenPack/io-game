import type { HeldAttackController } from "@client/client/HeldAttackController.ts";
import { type LocalWeaponState } from "@client/client/HeldAttackController.ts";
import type { PointerAimController } from "@client/client/input/PointerAimController.ts";
import type { ClientActionDispatcher } from "@client/client/network/ClientActionDispatcher.ts";
import type { PixiWorldPresentationSink } from "@client/net/presentation/PixiWorldPresentationSink.ts";
import type { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorldState } from "@client/net/ClientWorldState.ts";
import type { WsClient } from "@client/net/WsClient.ts";
import { normalizeAngle, shortestAngleDelta } from "@shared/math/angle.ts";
import type { InputMovement } from "@shared/net/protocol.ts";

const INPUT_KEEPALIVE_INTERVAL_MS = 100;
const INPUT_THETA_EPSILON = 0.0001;

type SentInputIntent = {
  theta: number;
  movement: InputMovement;
};

type ClientInputControllerOptions = {
  inputManager: InputManager;
  networkClient: WsClient;
  pointerAimController: PointerAimController;
  actionDispatcher: ClientActionDispatcher;
  heldAttackController: HeldAttackController;
  presentationSink: PixiWorldPresentationSink;
  isSessionReady: () => boolean;
  isTransportConnected: () => boolean;
  getLocalPlayerEntity: () => ClientEntity | undefined;
  getLocalPlayerVisualPose: () => {
    x: number;
    y: number;
    rotation: number;
  } | null;
  getPlayerEntityId: () => number | undefined;
  getWorldState: () => ClientWorldState | undefined;
};

export class ClientInputController {
  private readonly options: ClientInputControllerOptions;
  private lastInputSentAtMs = Number.NEGATIVE_INFINITY;
  private lastSentInputIntent?: SentInputIntent;
  private readonly heldMovement: InputMovement = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  constructor(options: ClientInputControllerOptions) {
    this.options = options;
  }

  public bindMoveIntent(): void {
    this.options.inputManager.onMoveIntent(({ key, pressed }) => {
      this.heldMovement[key] = pressed;
      this.sendInputIntentIfNeeded(performance.now(), true);
    });
  }

  public reset(): void {
    this.options.inputManager.stopHoldFire();
    this.heldMovement.up = false;
    this.heldMovement.down = false;
    this.heldMovement.left = false;
    this.heldMovement.right = false;
    this.lastInputSentAtMs = Number.NEGATIVE_INFINITY;
    this.lastSentInputIntent = undefined;
  }

  public setDebugMovementIntent(movement: Partial<InputMovement>): void {
    this.heldMovement.up = movement.up ?? false;
    this.heldMovement.down = movement.down ?? false;
    this.heldMovement.left = movement.left ?? false;
    this.heldMovement.right = movement.right ?? false;
    this.sendInputIntentIfNeeded(performance.now(), true);
  }

  public refreshPointerTargetFromScreen(): void {
    const aimTarget =
      this.options.pointerAimController.refreshPointerTargetFromScreen();
    if (!aimTarget) {
      return;
    }
    this.options.inputManager.updateHoldFireTarget(aimTarget.x, aimTarget.y);
  }

  public syncLocalPlayerAimPresentation(
    playerPose: { x: number; y: number; rotation: number } | null,
  ): void {
    const playerEntityId = this.options.getPlayerEntityId();
    if (playerEntityId === undefined) {
      return;
    }

    if (!playerPose || !this.options.getLocalPlayerEntity()?.alive) {
      this.options.presentationSink.setPresentationOverride(
        playerEntityId,
        null,
      );
      return;
    }

    const localAimTheta =
      this.options.pointerAimController.computeAimThetaFromScreen();
    if (localAimTheta === null) {
      this.options.presentationSink.setPresentationOverride(
        playerEntityId,
        null,
      );
      return;
    }

    this.options.presentationSink.setPresentationOverride(playerEntityId, {
      x: playerPose.x,
      y: playerPose.y,
      rotation: localAimTheta,
    });
  }

  public sendInputIntentIfNeeded(now: number, force = false): void {
    if (
      !this.options.isSessionReady() ||
      !this.options.isTransportConnected()
    ) {
      return;
    }

    const player = this.options.getLocalPlayerEntity();
    if (!player?.alive) {
      return;
    }

    const visualPose = this.options.getLocalPlayerVisualPose();
    const theta =
      this.options.pointerAimController.computeAimTheta(visualPose) ??
      visualPose?.rotation ??
      player.rotation;
    const movement = { ...this.heldMovement };
    const inputChanged = this.hasInputIntentChanged(theta, movement);
    const keepaliveDue =
      now - this.lastInputSentAtMs >= INPUT_KEEPALIVE_INTERVAL_MS;
    if (!force && !inputChanged && !keepaliveDue) {
      return;
    }

    const seq = this.options.inputManager.nextSequence();
    const clientTimeMs = performance.now();
    this.options.networkClient.sendInputIntent(
      seq,
      clientTimeMs,
      theta,
      movement,
    );
    this.lastInputSentAtMs = now;
    this.lastSentInputIntent = {
      theta,
      movement,
    };
  }

  public updateHeldAttack(now: number): void {
    const holdFireTarget = this.options.inputManager.getHoldFireTarget();
    if (
      !holdFireTarget ||
      !this.options.isSessionReady() ||
      !this.options.isTransportConnected()
    ) {
      return;
    }

    const localPlayer = this.options.getLocalPlayerEntity();
    const activeWeapon = this.getLocalActiveWeapon();
    if (!localPlayer?.alive || !activeWeapon) {
      return;
    }
    if (
      !this.options.heldAttackController.canSendHeldAttack(now, activeWeapon)
    ) {
      return;
    }

    const theta = this.options.pointerAimController.computeAimTheta(
      this.options.getLocalPlayerVisualPose(),
    );
    if (theta === null) {
      return;
    }
    this.sendAttackAction(theta, now);
  }

  public queueAttackFromWorldPoint(x: number, y: number): void {
    const theta = this.computeThetaFromWorldPoint(x, y);
    if (theta === null) {
      return;
    }
    this.sendAttackAction(theta, performance.now());
  }

  private sendAttackAction(theta: number, now: number): boolean {
    const activeWeapon = this.getLocalActiveWeapon();
    if (!activeWeapon) {
      return false;
    }
    if (
      !this.options.heldAttackController.canLikelyExecuteAttack(activeWeapon)
    ) {
      return false;
    }

    this.options.actionDispatcher.queueAttack(theta);
    const playerEntityId = this.options.getPlayerEntityId();
    const world = this.options.getWorldState()?.clientWorld;
    if (playerEntityId !== undefined && world) {
      this.options.presentationSink.playAttackAnimation(playerEntityId, world);
    }
    this.options.heldAttackController.onAttackSent(now, activeWeapon);
    return true;
  }

  private getLocalActiveWeapon(): LocalWeaponState | undefined {
    return this.options.getLocalPlayerEntity()?.equippedItem;
  }

  private computeThetaFromWorldPoint(
    x: number,
    y: number,
    playerPose = this.options.getLocalPlayerVisualPose(),
  ): number | null {
    if (!playerPose) {
      return null;
    }

    const deltaX = x - playerPose.x;
    const deltaY = y - playerPose.y;
    if (Math.hypot(deltaX, deltaY) <= Number.EPSILON) {
      return null;
    }

    return normalizeAngle(Math.atan2(deltaY, deltaX));
  }

  private hasInputIntentChanged(
    theta: number,
    movement: InputMovement,
  ): boolean {
    const last = this.lastSentInputIntent;
    if (!last) {
      return true;
    }
    return (
      Math.abs(shortestAngleDelta(last.theta, theta)) > INPUT_THETA_EPSILON ||
      last.movement.up !== movement.up ||
      last.movement.down !== movement.down ||
      last.movement.left !== movement.left ||
      last.movement.right !== movement.right
    );
  }
}

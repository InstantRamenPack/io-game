import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedRenderContext,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { drawCircle } from "@client/render/pixi/PixiGraphicUtils.ts";
import * as PIXI from "pixi.js";

type PunchSide = "left" | "right";

const HAND_FILL_COLOR = 0xd9b48a;
const HAND_STROKE_COLOR = 0x151515;
const HAND_RADIUS = 7;
const IDLE_FORWARD_OFFSET = 10;
const IDLE_SIDE_OFFSET = 9;
const PUNCH_FORWARD_DISTANCE = 18;
const RECOVER_PULLBACK = 3;

/**
 * Draws paired fists and alternates punches between hands.
 */
export class FistsEquippedRenderer implements EquippedItemRenderer {
  private readonly handGraphicsByContainer = new WeakMap<
    PIXI.Container,
    { left: PIXI.Graphics; right: PIXI.Graphics }
  >();
  private readonly punchSideByEntityId = new Map<number, PunchSide>();

  public syncStatic(input: EquippedStaticSyncInput): void {
    input.sprite.visible = false;
    input.container.rotation = input.rotation;

    const hands = this.ensureHands(input.container);
    this.drawHand(hands.left);
    this.drawHand(hands.right);
    this.syncHandPositions(input, hands);
  }

  public syncAnimated(input: EquippedAnimatedSyncInput): void {
    input.sprite.visible = false;
    input.container.rotation = input.rotation;
    this.syncHandPositions(input, this.ensureHands(input.container));
  }

  public onAttackStart(context: EquippedRenderContext): void {
    const previousSide = this.punchSideByEntityId.get(context.entity.id);
    this.punchSideByEntityId.set(
      context.entity.id,
      previousSide === "left" ? "right" : "left",
    );
  }

  private ensureHands(container: PIXI.Container): {
    left: PIXI.Graphics;
    right: PIXI.Graphics;
  } {
    const existingHands = this.handGraphicsByContainer.get(container);
    if (
      existingHands &&
      existingHands.left.parent === container &&
      existingHands.right.parent === container
    ) {
      return existingHands;
    }

    const hands = {
      left: new PIXI.Graphics(),
      right: new PIXI.Graphics(),
    };
    container.addChild(hands.left);
    container.addChild(hands.right);
    this.handGraphicsByContainer.set(container, hands);
    return hands;
  }

  private drawHand(graphics: PIXI.Graphics): void {
    drawCircle(graphics, 0, 0, HAND_RADIUS, HAND_FILL_COLOR, {
      color: HAND_STROKE_COLOR,
      width: 2,
      alpha: 1,
    });
  }

  private syncHandPositions(
    input: Pick<EquippedStaticSyncInput, "entity" | "progress">,
    hands: { left: PIXI.Graphics; right: PIXI.Graphics },
  ): void {
    const isPunchActive = input.progress < 0.999;
    const punchProgress = isPunchActive
      ? Math.sin(input.progress * Math.PI)
      : 0;
    const punchingSide =
      this.punchSideByEntityId.get(input.entity.id) ?? "left";

    this.positionHand(
      hands.left,
      "left",
      punchingSide,
      punchProgress,
      isPunchActive,
    );
    this.positionHand(
      hands.right,
      "right",
      punchingSide,
      punchProgress,
      isPunchActive,
    );
  }

  private positionHand(
    graphics: PIXI.Graphics,
    handSide: PunchSide,
    punchingSide: PunchSide,
    punchProgress: number,
    isPunchActive: boolean,
  ): void {
    const sideSign = handSide === "left" ? -1 : 1;
    const isPunchingHand = isPunchActive && handSide === punchingSide;
    const forwardOffset = isPunchingHand
      ? IDLE_FORWARD_OFFSET + PUNCH_FORWARD_DISTANCE * punchProgress
      : IDLE_FORWARD_OFFSET - RECOVER_PULLBACK * punchProgress;
    graphics.position.set(forwardOffset, sideSign * IDLE_SIDE_OFFSET);
  }
}

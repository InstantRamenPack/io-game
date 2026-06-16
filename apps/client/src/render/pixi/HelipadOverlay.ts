import { Container, Graphics, Text } from "pixi.js";
import type {
  ExtractionSnapshot,
  ExtractionStage,
} from "@shared/net/snapshots.ts";
import { simulationTicksToWallSeconds } from "@shared/config/simulationTicks.ts";
import { extractionConfig } from "@shared/config/gameplayConfig.ts";

const HELIPAD_VISUAL_RADIUS = extractionConfig.fallbackHelipad.radius - 30;

const RING_COLOR: Record<ExtractionStage, number> = {
  locked: 0xff4422,
  active: 0x44dd66,
  board_timer: 0x44dd66,
  chopper_incoming: 0x44aaff,
  complete: 0xffffff,
};

export class HelipadOverlay {
  public readonly container: Container;
  private readonly ring: Graphics;
  private readonly labelText: Text;
  private readonly timerText: Text;
  private pulse = 0;

  constructor() {
    this.container = new Container();
    this.setWorldPosition(
      extractionConfig.fallbackHelipad.x,
      extractionConfig.fallbackHelipad.y,
    );
    this.container.zIndex = 5;

    this.ring = new Graphics();
    this.container.addChild(this.ring);

    this.labelText = new Text({
      text: "",
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
        dropShadow: { distance: 2, blur: 4, alpha: 0.8, angle: Math.PI / 4 },
        align: "center",
      },
    });
    this.labelText.anchor.set(0.5, 0.5);
    this.labelText.y = HELIPAD_VISUAL_RADIUS + 22;
    this.container.addChild(this.labelText);

    this.timerText = new Text({
      text: "",
      style: {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: 28,
        fontWeight: "bold",
        fill: 0xffffff,
        dropShadow: { distance: 2, blur: 6, alpha: 0.9, angle: Math.PI / 4 },
        align: "center",
      },
    });
    this.timerText.anchor.set(0.5, 0.5);
    this.timerText.y = HELIPAD_VISUAL_RADIUS + 52;
    this.container.addChild(this.timerText);

    this.container.visible = false;
  }

  public setWorldPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  public update(
    state: ExtractionSnapshot | null,
    deltaMs: number,
    effectiveSimulationTickRate: number,
  ): void {
    if (!state || state.stage === "complete") {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;
    this.pulse = (this.pulse + deltaMs / 600) % (Math.PI * 2);
    const pulseAlpha = 0.55 + 0.35 * Math.sin(this.pulse);

    const color = RING_COLOR[state.stage];

    this.ring.clear();
    this.ring
      .circle(0, 0, HELIPAD_VISUAL_RADIUS + 8)
      .stroke({ width: 5, color, alpha: pulseAlpha });
    this.ring
      .circle(0, 0, HELIPAD_VISUAL_RADIUS + 16)
      .stroke({ width: 2, color, alpha: pulseAlpha * 0.4 });

    switch (state.stage) {
      case "locked":
        this.labelText.text =
          state.lockedReason === "comms_offline"
            ? "COMMS OFFLINE"
            : "EXTRACTION LOCKED";
        this.labelText.style.fill = 0xff6644;
        this.timerText.text = "";
        break;

      case "active":
        this.labelText.text = "STAND HERE TO EXTRACT";
        this.labelText.style.fill = 0x88ffaa;
        this.timerText.text = `${state.playersOnPad}/${state.totalAlivePlayers} on pad`;
        this.timerText.style.fontSize = 20;
        break;

      case "board_timer": {
        const allOn =
          state.totalAlivePlayers > 0 &&
          state.playersOnPad >= state.totalAlivePlayers;
        const remainingTicks = Math.max(
          0,
          state.boardTimerGoalTicks - state.boardElapsedTicks,
        );
        const remaining = Math.ceil(
          simulationTicksToWallSeconds(
            remainingTicks,
            effectiveSimulationTickRate,
            1,
          ),
        );
        this.labelText.text = allOn ? "EXTRACTING..." : "RETURN TO HELIPAD";
        this.labelText.style.fill = allOn ? 0x88ffaa : 0xffdd44;
        this.timerText.text = allOn
          ? `${remaining}s`
          : `${state.playersOnPad}/${state.totalAlivePlayers} on pad`;
        this.timerText.style.fontSize = allOn ? 28 : 20;
        break;
      }

      case "chopper_incoming": {
        const remainingTicks = Math.max(
          0,
          state.boardTimerGoalTicks - state.boardElapsedTicks,
        );
        const remaining = Math.ceil(
          simulationTicksToWallSeconds(
            remainingTicks,
            effectiveSimulationTickRate,
            1,
          ),
        );
        this.labelText.text = "EXTRACTING...";
        this.labelText.style.fill = 0x88ffaa;
        this.timerText.text = `${remaining}s`;
        this.timerText.style.fontSize = 28;
        break;
      }
    }
  }
}

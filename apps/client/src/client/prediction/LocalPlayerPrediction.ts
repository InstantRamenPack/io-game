import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientMovementSimulator } from "@client/client/prediction/ClientMovementSimulator.ts";
import type { PredictedInput } from "@client/client/prediction/PredictedInput.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";

export class LocalPlayerPrediction {
  private readonly simulator = new ClientMovementSimulator();
  private readonly pendingInputs: PredictedInput[] = [];
  private correctionOffsetX = 0;
  private correctionOffsetY = 0;

  public constructor(private readonly gameConfig: GameConfig) {}

  public reset(): void {
    this.pendingInputs.length = 0;
    this.correctionOffsetX = 0;
    this.correctionOffsetY = 0;
  }

  public getPendingInputCount(): number {
    return this.pendingInputs.length;
  }

  public recordAndPredict(player: ClientEntity, input: PredictedInput): void {
    if (!this.gameConfig.prediction.enabled) {
      return;
    }

    this.pendingInputs.push(input);
    this.prunePendingInputs();

    this.simulator.simulateLocalPlayer(player, {
      movement: input.movement,
      theta: input.theta,
      deltaMs: input.frameDeltaMs,
    });
  }

  public reconcile(
    player: ClientEntity,
    authoritative: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation: number;
    },
    lastProcessedSeq: number | undefined,
  ): void {
    if (!this.gameConfig.prediction.enabled) {
      player.x = authoritative.x;
      player.y = authoritative.y;
      player.vx = authoritative.vx;
      player.vy = authoritative.vy;
      player.rotation = authoritative.rotation;
      return;
    }

    const beforeX = player.x;
    const beforeY = player.y;

    player.x = authoritative.x;
    player.y = authoritative.y;
    player.vx = authoritative.vx;
    player.vy = authoritative.vy;
    player.rotation = authoritative.rotation;

    if (lastProcessedSeq !== undefined) {
      this.dropAcknowledgedInputs(lastProcessedSeq);
    }

    for (const input of this.pendingInputs) {
      this.simulator.simulateLocalPlayer(player, {
        movement: input.movement,
        theta: input.theta,
        deltaMs: input.frameDeltaMs,
      });
    }

    const errorX = beforeX - player.x;
    const errorY = beforeY - player.y;
    const errorDistance = Math.hypot(errorX, errorY);

    if (errorDistance >= this.gameConfig.prediction.reconciliationSnapDistance) {
      this.correctionOffsetX = 0;
      this.correctionOffsetY = 0;
      return;
    }

    if (
      errorDistance >= this.gameConfig.prediction.reconciliationSmoothDistance
    ) {
      this.correctionOffsetX += errorX;
      this.correctionOffsetY += errorY;
    }
  }

  public applyVisualCorrection(player: ClientEntity, deltaMs: number): void {
    if (!this.gameConfig.prediction.enabled) {
      return;
    }

    if (
      Math.abs(this.correctionOffsetX) <= 0.01 &&
      Math.abs(this.correctionOffsetY) <= 0.01
    ) {
      this.correctionOffsetX = 0;
      this.correctionOffsetY = 0;
      return;
    }

    const sharpness = this.gameConfig.prediction.reconciliationSmoothSharpness;
    const t = 1 - Math.exp(-sharpness * (deltaMs / 1000));

    const applyX = this.correctionOffsetX * t;
    const applyY = this.correctionOffsetY * t;

    player.x += applyX;
    player.y += applyY;

    this.correctionOffsetX -= applyX;
    this.correctionOffsetY -= applyY;
  }

  private dropAcknowledgedInputs(lastProcessedSeq: number): void {
    let removeCount = 0;
    while (
      removeCount < this.pendingInputs.length &&
      this.pendingInputs[removeCount]?.seq <= lastProcessedSeq
    ) {
      removeCount += 1;
    }

    if (removeCount > 0) {
      this.pendingInputs.splice(0, removeCount);
    }
  }

  private prunePendingInputs(): void {
    const max = this.gameConfig.prediction.maxPendingInputs;
    if (this.pendingInputs.length > max) {
      this.pendingInputs.splice(0, this.pendingInputs.length - max);
    }

    const maxAgeMs = this.gameConfig.prediction.maxClientPredictionMs;
    if (maxAgeMs <= 0) {
      return;
    }

    const newest = this.pendingInputs[this.pendingInputs.length - 1];
    if (!newest) {
      return;
    }

    const cutoff = newest.clientTimeMs - maxAgeMs;
    while (
      this.pendingInputs.length > 0 &&
      (this.pendingInputs[0]?.clientTimeMs ?? 0) < cutoff
    ) {
      this.pendingInputs.shift();
    }
  }
}

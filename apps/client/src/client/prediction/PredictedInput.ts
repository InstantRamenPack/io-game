import type { InputMovement } from "@shared/net/protocol.ts";

export type PredictedInput = {
  seq: number;
  clientTimeMs: number;
  frameDeltaMs: number;
  theta: number;
  movement: InputMovement;
};

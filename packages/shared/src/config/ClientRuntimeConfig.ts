import type { GameConfig } from "@shared/config/GameConfig.ts";
import { z } from "zod";

export const ClientRuntimeConfigSchema = z.object({
  googleClientId: z.string().min(1).nullable(),
  protocolVersion: z.number().int().positive(),
  tickRate: z.number().int().positive(),
  worldSize: z.object({
    w: z.number().finite().positive(),
    h: z.number().finite().positive(),
  }),
});

export type ClientRuntimeConfig = z.infer<typeof ClientRuntimeConfigSchema>;

export function makeClientRuntimeConfig(
  gameConfig: GameConfig,
  googleClientId: string | null | undefined,
): ClientRuntimeConfig {
  return {
    googleClientId: googleClientId ?? null,
    protocolVersion: gameConfig.protocolVersion,
    tickRate: gameConfig.tickRate,
    worldSize: {
      w: gameConfig.worldSize.w,
      h: gameConfig.worldSize.h,
    },
  };
}

import type { GameConfig } from "@shared/config/GameConfig.ts";
import { z } from "zod";

export const ClientRuntimeConfigSchema = z.object({
  googleClientId: z.string().min(1).nullable(),
  compatHash: z.string().min(1),
  tickRate: z.number().int().positive(),
  worldSize: z.object({
    w: z.number().finite().positive(),
    h: z.number().finite().positive(),
  }),
  interpolation: z
    .object({
      snapDistance: z.number().finite().nonnegative(),
      historySize: z.number().int().min(2),
      tickDurationSmoothing: z.number().positive().max(1),
      renderDelaySmoothing: z.number().positive().max(1),
      minRenderDelayTicks: z.number().finite().nonnegative(),
      maxRenderDelayTicks: z.number().finite().nonnegative(),
      maxExtrapolationTicks: z.number().finite().nonnegative(),
      tickDurationMinFactor: z.number().positive(),
      tickDurationMaxFactor: z.number().positive(),
      arrivalEwmaSmoothing: z.number().positive().max(1),
      jitterEwmaSmoothing: z.number().positive().max(1),
      jitterBufferMultiplier: z.number().finite().nonnegative(),
      jitterBufferSafetyMs: z.number().finite().nonnegative(),
      maxDebugLogEntries: z.number().int().min(100),
      correctionFollowSharpness: z.number().positive(),
      correctionEpsilon: z.number().finite().nonnegative(),
      correctionFrameScaleMin: z.number().positive(),
      correctionFrameScaleMax: z.number().positive(),
    })
    .superRefine((interpolation, context) => {
      if (
        interpolation.maxRenderDelayTicks < interpolation.minRenderDelayTicks
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxRenderDelayTicks"],
          message: "maxRenderDelayTicks must be >= minRenderDelayTicks",
        });
      }
      if (
        interpolation.tickDurationMaxFactor <=
        interpolation.tickDurationMinFactor
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tickDurationMaxFactor"],
          message: "tickDurationMaxFactor must be > tickDurationMinFactor",
        });
      }
      if (
        interpolation.correctionFrameScaleMax <
        interpolation.correctionFrameScaleMin
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctionFrameScaleMax"],
          message: "correctionFrameScaleMax must be >= correctionFrameScaleMin",
        });
      }
    }),
});

export type ClientRuntimeConfig = z.infer<typeof ClientRuntimeConfigSchema>;

export function makeClientRuntimeConfig(
  gameConfig: GameConfig,
  googleClientId: string | null | undefined,
): ClientRuntimeConfig {
  return {
    googleClientId: googleClientId ?? null,
    compatHash: gameConfig.compatHash,
    tickRate: gameConfig.tickRate,
    worldSize: {
      w: gameConfig.worldSize.w,
      h: gameConfig.worldSize.h,
    },
    interpolation: {
      ...gameConfig.interpolation,
    },
  };
}

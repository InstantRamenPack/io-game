import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  NonNegativeFiniteNumberSchema,
  PositiveFiniteNumberSchema,
  PositiveIntSchema,
} from "@shared/validation/schemas.ts";
import { z } from "zod";

export const CLIENT_RUNTIME_CONFIG_COMPAT_DESCRIPTOR = Object.freeze([
  "compatHash",
  "tickRate",
  "worldSize",
  "interpolation",
]);

export const ClientRuntimeConfigSchema = z.object({
  compatHash: z.string().min(1),
  tickRate: PositiveIntSchema,
  worldSize: z.object({
    w: PositiveFiniteNumberSchema,
    h: PositiveFiniteNumberSchema,
  }),
  interpolation: z
    .object({
      snapDistance: NonNegativeFiniteNumberSchema,
      historySize: PositiveIntSchema.min(2),
      tickDurationSmoothing: z.number().positive().max(1),
      renderDelaySmoothing: z.number().positive().max(1),
      minRenderDelayTicks: NonNegativeFiniteNumberSchema,
      maxRenderDelayTicks: NonNegativeFiniteNumberSchema,
      maxExtrapolationTicks: NonNegativeFiniteNumberSchema,
      tickDurationMinFactor: z.number().positive(),
      tickDurationMaxFactor: z.number().positive(),
      arrivalEwmaSmoothing: z.number().positive().max(1),
      jitterEwmaSmoothing: z.number().positive().max(1),
      jitterBufferMultiplier: NonNegativeFiniteNumberSchema,
      jitterBufferSafetyMs: NonNegativeFiniteNumberSchema,
      maxDebugLogEntries: PositiveIntSchema.min(100),
      correctionFollowSharpness: z.number().positive(),
      correctionEpsilon: NonNegativeFiniteNumberSchema,
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
): ClientRuntimeConfig {
  return {
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

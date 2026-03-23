import { z } from "zod";

export const DamageEventPayloadSchema = z.object({
  sourceId: z.number().int().nonnegative(),
  targetId: z.number().int().nonnegative(),
  amount: z.number(),
  remainingHp: z.number(),
  maxHp: z.number(),
  x: z.number(),
  y: z.number(),
  isFatal: z.boolean(),
});

/**
 * Serialized gameplay event emitted alongside snapshots.
 * Discrete events ride next to snapshot state instead of being modeled as entities.
 */
export const NetEventSchema = z.object({
  type: z.literal("damage"),
  tick: z.number().int().nonnegative(),
  payload: DamageEventPayloadSchema,
});

export type DamageEventPayload = z.infer<typeof DamageEventPayloadSchema>;
export type NetEvent = z.infer<typeof NetEventSchema>;

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

export const ExplosionStyleSchema = z.enum([
  "landmine",
  "drone",
  "wallbreaker",
]);

const ExplosionEventPayloadSchema = z.object({
  sourceId: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
  style: ExplosionStyleSchema,
});

/**
 * Serialized gameplay event emitted alongside snapshots.
 * Discrete events ride next to snapshot state instead of being modeled as entities.
 */
export const NetEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("damage"),
    payload: DamageEventPayloadSchema,
  }),
  z.object({
    type: z.literal("explosion"),
    payload: ExplosionEventPayloadSchema,
  }),
]);

export type DamageEventPayload = z.infer<typeof DamageEventPayloadSchema>;
export type ExplosionStyle = z.infer<typeof ExplosionStyleSchema>;
export type NetEvent = z.infer<typeof NetEventSchema>;

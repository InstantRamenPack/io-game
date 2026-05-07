import { z } from "zod";
import {
  NonNegativeIntSchema,
  PositiveFiniteNumberSchema,
} from "@shared/validation/schemas.ts";

export const NET_EVENT_TYPES = ["damage", "explosion", "attack"] as const;

export const DamageEventPayloadSchema = z.object({
  sourceId: NonNegativeIntSchema,
  targetId: NonNegativeIntSchema,
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
  sourceId: NonNegativeIntSchema,
  x: z.number(),
  y: z.number(),
  radius: PositiveFiniteNumberSchema,
  style: ExplosionStyleSchema,
});

const AttackEventPayloadSchema = z.object({
  sourceId: NonNegativeIntSchema,
  x: z.number(),
  y: z.number(),
  attackStyle: z.enum(["swing", "jab", "shoot"]),
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
  z.object({
    type: z.literal("attack"),
    payload: AttackEventPayloadSchema,
  }),
]);

export type DamageEventPayload = z.infer<typeof DamageEventPayloadSchema>;
export type ExplosionStyle = z.infer<typeof ExplosionStyleSchema>;
export type AttackEventPayload = z.infer<typeof AttackEventPayloadSchema>;
export type NetEvent = z.infer<typeof NetEventSchema>;

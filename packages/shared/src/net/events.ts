import { z } from "zod";
import {
  NonNegativeIntSchema,
  PositiveFiniteNumberSchema,
} from "@shared/validation/schemas.ts";

export const NET_EVENT_TYPES = ["damage", "explosion", "attack", "wither_beam", "wither_airstrike_warning"] as const;

export const DamageEventPayloadSchema = z.object({
  sourceId: NonNegativeIntSchema,
  targetId: NonNegativeIntSchema,
  targetTypeId: z.string().optional(),
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

const WitherBeamEventPayloadSchema = z.object({
  sourceId: NonNegativeIntSchema,
  x: z.number(),
  y: z.number(),
  angle: z.number(),
  length: z.number(),
  width: z.number(),
});

const WitherAirstrikeWarningEventPayloadSchema = z.object({
  x: z.number(),
  y: z.number(),
  radius: z.number(),
  warningTicks: z.number(),
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
  z.object({
    type: z.literal("wither_beam"),
    payload: WitherBeamEventPayloadSchema,
  }),
  z.object({
    type: z.literal("wither_airstrike_warning"),
    payload: WitherAirstrikeWarningEventPayloadSchema,
  }),
]);

export type DamageEventPayload = z.infer<typeof DamageEventPayloadSchema>;
export type ExplosionStyle = z.infer<typeof ExplosionStyleSchema>;
export type AttackEventPayload = z.infer<typeof AttackEventPayloadSchema>;
export type WitherBeamEventPayload = z.infer<typeof WitherBeamEventPayloadSchema>;
export type WitherAirstrikeWarningEventPayload = z.infer<typeof WitherAirstrikeWarningEventPayloadSchema>;
export type NetEvent = z.infer<typeof NetEventSchema>;

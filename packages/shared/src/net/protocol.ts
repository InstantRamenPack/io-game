import type { RecipeId } from "@shared/content/types.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { RESOURCE_ID_PATTERN } from "@shared/ids/ResourceId.ts";
import { z } from "zod";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

export const PROTOCOL_VERSION = GameConfig.DEFAULT_PROTOCOL_VERSION;

const AttackInputSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const CraftInputSchema = z.object({
  recipeId: z.string().regex(/^recipe:[a-z0-9_./-]+$/),
});

const BuildInputSchema = z.object({
  itemTypeId: z.string().regex(RESOURCE_ID_PATTERN),
  x: z.number(),
  y: z.number(),
});

export const InputCommandSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    moveX: z.number(),
    moveY: z.number(),
    selectSlot: z.number().int().nonnegative().optional(),
    attack: AttackInputSchema.optional(),
    craft: CraftInputSchema.optional(),
    build: BuildInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const actionCount =
      Number(Boolean(value.attack)) +
      Number(Boolean(value.craft)) +
      Number(Boolean(value.build));
    if (actionCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one action of attack, craft, or build is allowed.",
      });
    }
  });

export const HelloMessageSchema = z.object({
  t: z.literal("hello"),
  protocolVersion: z.number(),
  googleIdToken: z.string().min(1).optional(),
  playerName: z.string().optional(),
});

export const InputMessageSchema = z.object({
  t: z.literal("input"),
  cmd: InputCommandSchema,
});

export const PingMessageSchema = z.object({
  t: z.literal("ping"),
  timeMs: z.number().optional(),
});

export const PongMessageSchema = z.object({
  t: z.literal("pong"),
  timeMs: z.number().optional(),
});

export const WelcomeMessageSchema = z.object({
  t: z.literal("welcome"),
  entityId: z.number().int().nonnegative(),
});

const WorldSnapshotSchema = z.object({
  tick: z.number(),
  entities: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("player"),
        id: z.number(),
        typeId: z.string().regex(RESOURCE_ID_PATTERN),
        x: z.number(),
        y: z.number(),
        vx: z.number(),
        vy: z.number(),
        rotation: z.number(),
        radius: z.number(),
        hp: z.number(),
        maxHp: z.number(),
        ownerId: z.number().optional(),
        name: z.string(),
        inventory: z.array(
          z
            .discriminatedUnion("typeId", [
              z.object({
                id: z.number(),
                typeId: z.literal("item:basic_gun"),
                stackSize: z.number(),
                ownerId: z.number().optional(),
                ammoInMag: z.number(),
                magSize: z.number(),
                reloadTicksRemaining: z.number(),
              }),
            ])
            .or(
              z.object({
                id: z.number(),
                typeId: z.string().regex(RESOURCE_ID_PATTERN),
                stackSize: z.number(),
                ownerId: z.number().optional(),
              }),
            )
            .nullable(),
        ),
        activeSlot: z.number(),
        activeEffects: z.array(z.string()),
        moveSpeed: z.number(),
      }),
      z.object({
        kind: z.literal("enemy"),
        id: z.number(),
        typeId: z.string().regex(RESOURCE_ID_PATTERN),
        x: z.number(),
        y: z.number(),
        vx: z.number(),
        vy: z.number(),
        rotation: z.number(),
        radius: z.number(),
        hp: z.number(),
        maxHp: z.number(),
        ownerId: z.number().optional(),
        targetId: z.number().optional(),
      }),
      z.object({
        kind: z.literal("building"),
        id: z.number(),
        typeId: z.string().regex(RESOURCE_ID_PATTERN),
        x: z.number(),
        y: z.number(),
        vx: z.number(),
        vy: z.number(),
        rotation: z.number(),
        radius: z.number(),
        hp: z.number(),
        maxHp: z.number(),
        ownerId: z.number().optional(),
        label: z.string(),
        tier: z.number(),
      }),
      z.object({
        kind: z.literal("projectile"),
        id: z.number(),
        typeId: z.string().regex(RESOURCE_ID_PATTERN),
        x: z.number(),
        y: z.number(),
        vx: z.number(),
        vy: z.number(),
        rotation: z.number(),
        radius: z.number(),
        ownerId: z.number().optional(),
      }),
      z.object({
        kind: z.literal("pickup"),
        id: z.number(),
        typeId: z.string().regex(RESOURCE_ID_PATTERN),
        x: z.number(),
        y: z.number(),
        vx: z.number(),
        vy: z.number(),
        rotation: z.number(),
        radius: z.number(),
        ownerId: z.number().optional(),
        inventory: z.array(
          z
            .discriminatedUnion("typeId", [
              z.object({
                id: z.number(),
                typeId: z.literal("item:basic_gun"),
                stackSize: z.number(),
                ownerId: z.number().optional(),
                ammoInMag: z.number(),
                magSize: z.number(),
                reloadTicksRemaining: z.number(),
              }),
            ])
            .or(
              z.object({
                id: z.number(),
                typeId: z.string().regex(RESOURCE_ID_PATTERN),
                stackSize: z.number(),
                ownerId: z.number().optional(),
              }),
            )
            .nullable(),
        ),
      }),
    ]),
  ),
  events: z.array(
    z.object({
      type: z.literal("damage"),
      tick: z.number(),
      payload: z.object({
        sourceId: z.number(),
        targetId: z.number(),
        amount: z.number(),
        remainingHp: z.number(),
        maxHp: z.number(),
        x: z.number(),
        y: z.number(),
        isFatal: z.boolean(),
      }),
    }),
  ),
});

export const SnapshotMessageSchema = z.object({
  t: z.literal("snapshot"),
  snapshot: WorldSnapshotSchema,
});

export const ErrorMessageSchema = z.object({
  t: z.literal("error"),
  message: z.string(),
});

export const ClientToServerMessageSchema = z.discriminatedUnion("t", [
  HelloMessageSchema,
  InputMessageSchema,
  PingMessageSchema,
]);

export const ServerToClientMessageSchema = z.discriminatedUnion("t", [
  SnapshotMessageSchema,
  PongMessageSchema,
  WelcomeMessageSchema,
  ErrorMessageSchema,
]);

export type InputCommand = z.infer<typeof InputCommandSchema>;
export type CraftInput = { recipeId: RecipeId };
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type InputMessage = {
  t: "input";
  cmd: InputCommand;
};
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type SnapshotMessage = {
  t: "snapshot";
  snapshot: WorldSnapshot;
};
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ClientToServerMessage = HelloMessage | InputMessage | PingMessage;
export type ServerToClientMessage =
  | SnapshotMessage
  | PongMessage
  | WelcomeMessage
  | ErrorMessage;

/**
 * Parses raw JSON text and returns null instead of throwing on malformed input.
 * @param rawMessage Raw text received from a transport boundary.
 * @returns Parsed JSON value or null when decoding fails.
 */
function parseJson(rawMessage: string): unknown | null {
  try {
    return JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parses and validates a client-to-server protocol message.
 * @param rawMessage Raw JSON message received from a client.
 * @returns Typed client message or null when validation fails.
 */
export function parseClientToServerMessage(
  rawMessage: string,
): ClientToServerMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (!parsedJson) {
    return null;
  }
  const parsedMessage = ClientToServerMessageSchema.safeParse(parsedJson);
  return parsedMessage.success
    ? (parsedMessage.data as ClientToServerMessage)
    : null;
}

/**
 * Parses and validates a server-to-client protocol message.
 * @param rawMessage Raw JSON message received from the server.
 * @returns Typed server message or null when validation fails.
 */
export function parseServerToClientMessage(
  rawMessage: string,
): ServerToClientMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (!parsedJson) {
    return null;
  }
  const parsedMessage = ServerToClientMessageSchema.safeParse(parsedJson);
  return parsedMessage.success
    ? (parsedMessage.data as ServerToClientMessage)
    : null;
}

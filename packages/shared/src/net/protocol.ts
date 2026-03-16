import { GameConfig } from "@shared/config/GameConfig.ts";
import { z } from "zod";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

export const PROTOCOL_VERSION = GameConfig.DEFAULT_PROTOCOL_VERSION;

export const InputCommandSchema = z.object({
  seq: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  moveX: z.number(),
  moveY: z.number(),
});

export const HelloMessageSchema = z.object({
  t: z.literal("hello"),
  protocolVersion: z.number(),
  googleIdToken: z.string().min(1).optional(),
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
    z.object({
      id: z.number(),
      kind: z.string(),
      x: z.number(),
      y: z.number(),
      vx: z.number(),
      vy: z.number(),
      rotation: z.number(),
      radius: z.number(),
      hp: z.number().optional(),
      maxHp: z.number().optional(),
      ownerId: z.number().optional(),
      name: z.string().optional(),
      inventory: z
        .array(
          z
            .object({
              id: z.number(),
              kind: z.string(),
              stackSize: z.number(),
              ownerId: z.number().optional(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
            .nullable(),
        )
        .optional(),
      activeSlot: z.number().optional(),
    }),
  ),
  events: z.array(
    z.object({
      type: z.string(),
      tick: z.number(),
      payload: z.unknown(),
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

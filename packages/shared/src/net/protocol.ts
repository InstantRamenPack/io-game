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

const WorldSnapshotSchema = z.object({
  tick: z.number(),
  timeMs: z.number(),
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
      data: z.record(z.string(), z.unknown()).optional(),
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
  ErrorMessageSchema,
]);

export type InputCommand = z.infer<typeof InputCommandSchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema> & {
  snapshot: WorldSnapshot;
};
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;
export type ServerToClientMessage = z.infer<
  typeof ServerToClientMessageSchema
> & {
  snapshot?: WorldSnapshot;
};

/** Parses JSON and returns null instead of throwing on invalid payloads. */
function parseJson(rawMessage: string): unknown | null {
  try {
    return JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }
}

/** Parses and validates a client-to-server protocol message. */
export function parseClientToServerMessage(
  rawMessage: string,
): ClientToServerMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (!parsedJson) {
    return null;
  }
  const parsedMessage = ClientToServerMessageSchema.safeParse(parsedJson);
  return parsedMessage.success ? parsedMessage.data : null;
}

/** Parses and validates a server-to-client protocol message. */
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

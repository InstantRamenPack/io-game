import { GameConfig } from "@shared/config/GameConfig.ts";
import { RESOURCE_ID_PATTERN } from "@shared/ids/ResourceId.ts";
import { z } from "zod";
import { WorldSnapshotSchema } from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export const PROTOCOL_VERSION = GameConfig.DEFAULT_PROTOCOL_VERSION;

const AttackInputSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const CraftInputSchema = z.object({
  itemTypeId: z.string().regex(RESOURCE_ID_PATTERN),
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
    selectWeaponIndex: z.number().int().nonnegative().optional(),
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

export const ChatInputMessageSchema = z.object({
  t: z.literal("chat"),
  text: z.string().min(1).max(240),
});

export const PongMessageSchema = z.object({
  t: z.literal("pong"),
  timeMs: z.number().optional(),
});

export const WelcomeMessageSchema = z.object({
  t: z.literal("welcome"),
  entityId: z.number().int().nonnegative(),
});

export const SnapshotMessageSchema = z.object({
  t: z.literal("snapshot"),
  snapshot: WorldSnapshotSchema,
});

export const ErrorMessageSchema = z.object({
  t: z.literal("error"),
  message: z.string(),
});

export const ChatMessageSchema = z.object({
  t: z.literal("chat"),
  text: z.string(),
  kind: z.enum(["global", "system", "emote", "whisper"]).optional(),
  from: z.string().optional(),
});

export const ClientToServerMessageSchema = z.discriminatedUnion("t", [
  HelloMessageSchema,
  InputMessageSchema,
  PingMessageSchema,
  ChatInputMessageSchema,
]);

export const ServerToClientMessageSchema = z.discriminatedUnion("t", [
  SnapshotMessageSchema,
  PongMessageSchema,
  WelcomeMessageSchema,
  ErrorMessageSchema,
  ChatMessageSchema,
]);

export type InputCommand = z.infer<typeof InputCommandSchema>;
export type CraftInput = { itemTypeId: ResourceId };
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ChatInputMessage = z.infer<typeof ChatInputMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ClientToServerMessage =
  | HelloMessage
  | InputMessage
  | PingMessage
  | ChatInputMessage;
export type ServerToClientMessage =
  | SnapshotMessage
  | PongMessage
  | WelcomeMessage
  | ErrorMessage
  | ChatMessage;

type ParseServerMessageOptions = {
  validateSnapshots?: boolean;
};

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
  { validateSnapshots = true }: ParseServerMessageOptions = {},
): ServerToClientMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (!parsedJson) {
    return null;
  }
  if (
    !validateSnapshots &&
    typeof parsedJson === "object" &&
    "t" in parsedJson &&
    parsedJson.t === "snapshot" &&
    "snapshot" in parsedJson
  ) {
    return parsedJson as ServerToClientMessage;
  }
  const parsedMessage = ServerToClientMessageSchema.safeParse(parsedJson);
  return parsedMessage.success
    ? (parsedMessage.data as ServerToClientMessage)
    : null;
}

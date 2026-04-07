import { RESOURCE_ID_PATTERN } from "@shared/ids/ResourceId.ts";
import { WorldSnapshotSchema } from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { z } from "zod";

export const MoveIntentKeySchema = z.enum(["up", "down", "left", "right"]);

const AttackInputSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const CraftInputSchema = z.object({
  itemTypeId: z.string().regex(RESOURCE_ID_PATTERN),
});

const BuildInputSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const InventoryMoveInputSchema = z.object({
  fromSlotIndex: z.number().int().min(0).max(9),
  toSlotIndex: z.number().int().min(0).max(9),
});

export const HelloMessageSchema = z.object({
  t: z.literal("hello"),
  compatHash: z.string().min(1),
  googleIdToken: z.string().min(1).optional(),
  playerName: z.string().optional(),
});

export const MoveIntentMessageSchema = z.object({
  t: z.literal("move"),
  seq: z.number().int().nonnegative(),
  key: MoveIntentKeySchema,
  pressed: z.boolean(),
});

export const AttackActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: z.number().int().nonnegative(),
  action: z.literal("attack"),
  aim: AttackInputSchema,
});

export const CraftActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: z.number().int().nonnegative(),
  action: z.literal("craft"),
  craft: CraftInputSchema,
});

export const BuildActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: z.number().int().nonnegative(),
  action: z.literal("build"),
  build: BuildInputSchema,
});

export const InventoryMoveActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: z.number().int().nonnegative(),
  action: z.literal("inventoryMove"),
  inventoryMove: InventoryMoveInputSchema,
});

export const SelectHotbarActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: z.number().int().nonnegative(),
  action: z.literal("selectHotbar"),
  index: z.number().int().min(0).max(9),
});

export const ActionMessageSchema = z.discriminatedUnion("action", [
  AttackActionMessageSchema,
  CraftActionMessageSchema,
  BuildActionMessageSchema,
  InventoryMoveActionMessageSchema,
  SelectHotbarActionMessageSchema,
]);

export const RespawnMessageSchema = z.object({
  t: z.literal("respawn"),
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
  MoveIntentMessageSchema,
  ActionMessageSchema,
  RespawnMessageSchema,
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

export type AttackInput = z.infer<typeof AttackInputSchema>;
export type BuildInput = z.infer<typeof BuildInputSchema>;
export type CraftInput = { itemTypeId: ResourceId };
export type InventoryMoveInput = z.infer<typeof InventoryMoveInputSchema>;
export type MoveIntentKey = z.infer<typeof MoveIntentKeySchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type MoveIntentMessage = z.infer<typeof MoveIntentMessageSchema>;
export type AttackActionMessage = z.infer<typeof AttackActionMessageSchema>;
export type CraftActionMessage = z.infer<typeof CraftActionMessageSchema>;
export type BuildActionMessage = z.infer<typeof BuildActionMessageSchema>;
export type InventoryMoveActionMessage = z.infer<
  typeof InventoryMoveActionMessageSchema
>;
export type SelectHotbarActionMessage = z.infer<
  typeof SelectHotbarActionMessageSchema
>;
export type ActionMessage = z.infer<typeof ActionMessageSchema>;
export type RespawnMessage = z.infer<typeof RespawnMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ChatInputMessage = z.infer<typeof ChatInputMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ClientToServerMessage =
  | HelloMessage
  | MoveIntentMessage
  | ActionMessage
  | RespawnMessage
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

function parseJson(rawMessage: string): unknown | null {
  try {
    return JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }
}

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

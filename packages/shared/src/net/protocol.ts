import { MAX_CHAT_MESSAGE_LENGTH } from "@shared/gameplay/constants.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import { WorldSnapshotSchema } from "@shared/net/snapshots.ts";
import { isJsonObject, parseJsonValue } from "@shared/json.ts";
import {
  ChatTextSchema,
  EntityIdSchema,
  FiniteNumberSchema,
  HotbarIndexSchema,
  NonNegativeIntSchema,
  ResourceIdSchema,
} from "@shared/validation/schemas.ts";
import { z } from "zod";

const MoveIntentKeySchema = z.enum(["up", "down", "left", "right"]);

const ThetaInputSchema = FiniteNumberSchema.transform((theta) =>
  normalizeAngle(theta),
);

const CraftInputSchema = z.object({
  itemTypeId: ResourceIdSchema,
});

const BuildInputSchema = z.object({
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
});

const InventoryMoveInputSchema = z.object({
  fromSlotIndex: HotbarIndexSchema,
  toSlotIndex: HotbarIndexSchema,
});

const ChestMoveInputSchema = z.object({
  chestEntityId: EntityIdSchema,
  fromSource: z.enum(["hotbar", "chest"]),
  fromIndex: z.number().int().min(0).max(26),
  toSource: z.enum(["hotbar", "chest"]),
  toIndex: z.number().int().min(0).max(26),
});

const HelloMessageSchema = z.object({
  t: z.literal("hello"),
  compatHash: z.string().min(1),
  googleIdToken: z.string().min(1).optional(),
  playerName: z.string().optional(),
});

const MoveIntentMessageSchema = z.object({
  t: z.literal("move"),
  seq: NonNegativeIntSchema,
  key: MoveIntentKeySchema,
  pressed: z.boolean(),
});

const AimMessageSchema = z.object({
  t: z.literal("aim"),
  seq: NonNegativeIntSchema,
  theta: ThetaInputSchema,
});

const AttackActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("attack"),
  theta: ThetaInputSchema,
});

const CraftActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("craft"),
  craft: CraftInputSchema,
});

const BuildActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("build"),
  build: BuildInputSchema,
});

const InventoryMoveActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("inventoryMove"),
  inventoryMove: InventoryMoveInputSchema,
});

const SelectHotbarActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("selectHotbar"),
  index: HotbarIndexSchema,
});

const ChestMoveActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("chestMove"),
  chestMove: ChestMoveInputSchema,
});

const DropActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("drop"),
  dropWholeStack: z.boolean(),
});

const PickupActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("pickup"),
});

const ActionMessageSchema = z.discriminatedUnion("action", [
  AttackActionMessageSchema,
  CraftActionMessageSchema,
  BuildActionMessageSchema,
  InventoryMoveActionMessageSchema,
  SelectHotbarActionMessageSchema,
  ChestMoveActionMessageSchema,
  DropActionMessageSchema,
  PickupActionMessageSchema,
]);

const RespawnMessageSchema = z.object({
  t: z.literal("respawn"),
});

const PingMessageSchema = z.object({
  t: z.literal("ping"),
  timeMs: FiniteNumberSchema.optional(),
});

const ChatInputMessageSchema = z.object({
  t: z.literal("chat"),
  text: ChatTextSchema,
});

const LobbyJoinActionSchema = z.object({
  t: z.literal("lobby"),
  action: z.literal("join"),
});

const LobbyJoinByCodeActionSchema = z.object({
  t: z.literal("lobby"),
  action: z.literal("joinByCode"),
  lobbyCode: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/),
});

const LobbyLeaveActionSchema = z.object({
  t: z.literal("lobby"),
  action: z.literal("leave"),
});

const LobbyActionMessageSchema = z.discriminatedUnion("action", [
  LobbyJoinActionSchema,
  LobbyJoinByCodeActionSchema,
  LobbyLeaveActionSchema,
]);

const PongMessageSchema = z.object({
  t: z.literal("pong"),
  timeMs: FiniteNumberSchema.optional(),
});

const WelcomeMessageSchema = z.object({
  t: z.literal("welcome"),
  entityId: NonNegativeIntSchema,
});

const SnapshotMessageSchema = z.object({
  t: z.literal("snapshot"),
  snapshot: WorldSnapshotSchema,
});

const ErrorMessageSchema = z.object({
  t: z.literal("error"),
  message: z.string(),
});

const ChatMessageSchema = z.object({
  t: z.literal("chat"),
  text: z.string().max(MAX_CHAT_MESSAGE_LENGTH),
  kind: z.enum(["global", "system", "emote", "whisper"]).optional(),
  from: z.string().optional(),
});

const LobbyStateMessageSchema = z.object({
  t: z.literal("lobby_state"),
  inLobby: z.boolean(),
  lobbyCode: z.string().optional(),
  playerCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  createdAtMs: z.number().int().nonnegative().optional(),
  countdownEndsAtMs: z.number().int().nonnegative().nullable().optional(),
  startedAtMs: z.number().int().nonnegative().nullable().optional(),
  serverNowMs: z.number().int().nonnegative(),
});

export const PROTOCOL_COMPAT_DESCRIPTOR = Object.freeze({
  clientToServer: [
    "hello",
    "move",
    "aim",
    "action:attack",
    "action:craft",
    "action:build",
    "action:inventoryMove",
    "action:selectHotbar",
    "action:chestMove",
    "action:drop",
    "action:pickup",
    "respawn",
    "ping",
    "chat",
    "lobby:join",
    "lobby:joinByCode",
    "lobby:leave",
  ],
  serverToClient: [
    "welcome",
    "snapshot",
    "pong",
    "error",
    "chat",
    "lobby_state",
  ],
});

const ClientToServerMessageSchema = z.discriminatedUnion("t", [
  HelloMessageSchema,
  MoveIntentMessageSchema,
  AimMessageSchema,
  ActionMessageSchema,
  RespawnMessageSchema,
  PingMessageSchema,
  ChatInputMessageSchema,
  LobbyActionMessageSchema,
]);

const ServerToClientMessageSchema = z.discriminatedUnion("t", [
  SnapshotMessageSchema,
  PongMessageSchema,
  WelcomeMessageSchema,
  ErrorMessageSchema,
  ChatMessageSchema,
  LobbyStateMessageSchema,
]);

export type MoveIntentKey = z.infer<typeof MoveIntentKeySchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type MoveIntentMessage = z.infer<typeof MoveIntentMessageSchema>;
export type AimMessage = z.infer<typeof AimMessageSchema>;
export type ActionMessage = z.infer<typeof ActionMessageSchema>;
type RespawnMessage = z.infer<typeof RespawnMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type PongMessage = z.infer<typeof PongMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
type ChatInputMessage = z.infer<typeof ChatInputMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type LobbyActionMessage = z.infer<typeof LobbyActionMessageSchema>;
export type LobbyStateMessage = z.infer<typeof LobbyStateMessageSchema>;
type ClientToServerMessage =
  | HelloMessage
  | MoveIntentMessage
  | AimMessage
  | ActionMessage
  | RespawnMessage
  | PingMessage
  | ChatInputMessage
  | LobbyActionMessage;
export type ServerToClientMessage =
  | SnapshotMessage
  | PongMessage
  | WelcomeMessage
  | ErrorMessage
  | ChatMessage
  | LobbyStateMessage;

type ParseServerMessageOptions = {
  validateSnapshots?: boolean;
};

function parseJson(rawMessage: string) {
  return parseJsonValue(rawMessage);
}

function isSnapshotMessage(
  value: ReturnType<typeof parseJson>,
): value is SnapshotMessage {
  return value !== null && isJsonObject(value) && value.t === "snapshot";
}

export function parseClientToServerMessage(
  rawMessage: string,
): ClientToServerMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (parsedJson === null) {
    return null;
  }
  const parsedMessage = ClientToServerMessageSchema.safeParse(parsedJson);
  return parsedMessage.success ? parsedMessage.data : null;
}

export function parseServerToClientMessage(
  rawMessage: string,
  { validateSnapshots = true }: ParseServerMessageOptions = {},
): ServerToClientMessage | null {
  const parsedJson = parseJson(rawMessage);
  if (parsedJson === null) {
    return null;
  }
  if (!validateSnapshots && isSnapshotMessage(parsedJson)) {
    return parsedJson;
  }
  const parsedMessage = ServerToClientMessageSchema.safeParse(parsedJson);
  return parsedMessage.success ? parsedMessage.data : null;
}

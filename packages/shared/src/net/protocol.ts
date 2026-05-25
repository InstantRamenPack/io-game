import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHEST_INDEX,
} from "@shared/gameplay/constants.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import { WorldSnapshotSchema } from "@shared/net/snapshots.ts";
import { parseJsonValue } from "@shared/json.ts";
import {
  ChatTextSchema,
  EntityIdSchema,
  FiniteNumberSchema,
  HotbarIndexSchema,
  NonNegativeIntSchema,
  ResourceIdSchema,
} from "@shared/validation/schemas.ts";
import { z } from "zod";
import {
  decode as decodeMsgpack,
  encode as encodeMsgpack,
} from "@msgpack/msgpack";
import {
  compactInputMessage,
  compactServerMessage,
  expandInputMessage,
  expandServerMessage,
} from "@shared/net/compactProtocol.ts";
import {
  recordProtocolDecodeFailure,
  recordProtocolMetric,
} from "@shared/net/protocolMetrics.ts";

const PACKET_KIND_OBJECT = 0;
const PACKET_KIND_INPUT = 1;
const PACKET_KIND_SERVER = 2;

const MoveIntentKeySchema = z.enum(["up", "down", "left", "right"]);

const ThetaInputSchema = FiniteNumberSchema.transform((theta) =>
  normalizeAngle(theta),
);

const InputMovementSchema = z
  .object({
    up: z.boolean(),
    down: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
  })
  .strict();

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

const ArmorMoveInputSchema = z.object({
  fromSource: z.enum(["hotbar", "armor"]),
  fromIndex: HotbarIndexSchema,
  toSource: z.enum(["hotbar", "armor"]),
  toIndex: HotbarIndexSchema,
});

const ChestMoveInputSchema = z.object({
  chestEntityId: EntityIdSchema,
  fromSource: z.enum(["hotbar", "chest"]),
  fromIndex: z.number().int().min(0).max(MAX_CHEST_INDEX),
  toSource: z.enum(["hotbar", "chest"]),
  toIndex: z.number().int().min(0).max(MAX_CHEST_INDEX),
});

const HelloMessageSchema = z.object({
  t: z.literal("hello"),
  compatHash: z.string().min(1),
  playerName: z.string().optional(),
  preview: z.boolean().optional(),
});

const InputIntentMessageSchema = z
  .object({
    t: z.literal("input"),
    seq: NonNegativeIntSchema,
    clientTimeMs: FiniteNumberSchema.optional(),
    theta: ThetaInputSchema,
    movement: InputMovementSchema,
  })
  .strict();

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

const ArmorMoveActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("armorMove"),
  armorMove: ArmorMoveInputSchema,
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

const RecycleActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("recycle"),
});

const RepairTowerActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("repair_tower"),
  towerId: EntityIdSchema,
});

const UseConsumableActionMessageSchema = z.object({
  t: z.literal("action"),
  seq: NonNegativeIntSchema,
  action: z.literal("useConsumable"),
  typeId: ResourceIdSchema,
});

const ActionMessageSchemaOptions = [
  AttackActionMessageSchema,
  CraftActionMessageSchema,
  BuildActionMessageSchema,
  InventoryMoveActionMessageSchema,
  SelectHotbarActionMessageSchema,
  ArmorMoveActionMessageSchema,
  ChestMoveActionMessageSchema,
  DropActionMessageSchema,
  PickupActionMessageSchema,
  RecycleActionMessageSchema,
  RepairTowerActionMessageSchema,
  UseConsumableActionMessageSchema,
] as const;

const ActionMessageSchema = z.discriminatedUnion(
  "action",
  ActionMessageSchemaOptions,
);

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

const LobbyStartActionSchema = z.object({
  t: z.literal("lobby"),
  action: z.literal("start"),
});

const LobbyActionMessageSchemaOptions = [
  LobbyJoinActionSchema,
  LobbyJoinByCodeActionSchema,
  LobbyLeaveActionSchema,
  LobbyStartActionSchema,
] as const;

const LobbyActionMessageSchema = z.discriminatedUnion(
  "action",
  LobbyActionMessageSchemaOptions,
);

const PongMessageSchema = z.object({
  t: z.literal("pong"),
  timeMs: FiniteNumberSchema.optional(),
});

const WelcomeMessageSchema = z.object({
  t: z.literal("welcome"),
  entityId: NonNegativeIntSchema,
  worldId: z.string().optional(),
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
  isHost: z.boolean(),
  lobbyCode: z.string().optional(),
  playerCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  createdAtMs: z.number().int().nonnegative().optional(),
  countdownEndsAtMs: z.number().int().nonnegative().nullable().optional(),
  startedAtMs: z.number().int().nonnegative().nullable().optional(),
  serverNowMs: z.number().int().nonnegative(),
});

const GameCompleteMessageSchema = z.object({
  t: z.literal("game_complete"),
  gameDurationMs: z.number().nonnegative(),
  wavesCompleted: z.number().int().nonnegative(),
});

const GameOverMessageSchema = z.object({
  t: z.literal("game_over"),
  gameDurationMs: z.number().nonnegative(),
  wavesCompleted: z.number().int().nonnegative(),
});

const SpectateUpdateMessageSchema = z.object({
  t: z.literal("spectate_update"),
  targetEntityId: z.number().int().nonnegative().nullable(),
});

type ObjectSchema = z.ZodObject<z.ZodRawShape>;

function literalField(schema: ObjectSchema, fieldName: string): string {
  const field = schema.shape[fieldName];
  if (!(field instanceof z.ZodLiteral)) {
    throw new Error(`[compat] Expected literal field '${fieldName}'`);
  }
  if (typeof field.value !== "string") {
    throw new Error(`[compat] Literal field '${fieldName}' must be a string`);
  }
  return field.value;
}

function literalTags(
  schemas: readonly ObjectSchema[],
  fieldName: string,
): readonly string[] {
  return Object.freeze(
    schemas.map((schema) => literalField(schema, fieldName)),
  );
}

function prefixedLiteralTags(
  schemas: readonly ObjectSchema[],
  fieldName: string,
  prefix: string,
): readonly string[] {
  return Object.freeze(
    schemas.map((schema) => `${prefix}${literalField(schema, fieldName)}`),
  );
}

function assertUniqueDescriptor(
  label: string,
  values: readonly string[],
): void {
  if (new Set(values).size === values.length) {
    return;
  }
  throw new Error(`[compat] Duplicate protocol descriptor entry in ${label}`);
}

const ClientToServerMessageSchemaOptions = [
  HelloMessageSchema,
  InputIntentMessageSchema,
  ActionMessageSchema,
  RespawnMessageSchema,
  PingMessageSchema,
  ChatInputMessageSchema,
  LobbyActionMessageSchema,
] as const;

const ServerToClientMessageSchemaOptions = [
  SnapshotMessageSchema,
  PongMessageSchema,
  WelcomeMessageSchema,
  ErrorMessageSchema,
  ChatMessageSchema,
  LobbyStateMessageSchema,
  GameCompleteMessageSchema,
  GameOverMessageSchema,
  SpectateUpdateMessageSchema,
] as const;

export const PROTOCOL_COMPAT_DESCRIPTOR = Object.freeze({
  clientToServer: Object.freeze([
    ...literalTags([HelloMessageSchema, InputIntentMessageSchema], "t"),
    ...prefixedLiteralTags(ActionMessageSchemaOptions, "action", "action:"),
    ...literalTags(
      [RespawnMessageSchema, PingMessageSchema, ChatInputMessageSchema],
      "t",
    ),
    ...prefixedLiteralTags(LobbyActionMessageSchemaOptions, "action", "lobby:"),
  ]),
  serverToClient: literalTags(ServerToClientMessageSchemaOptions, "t"),
});

assertUniqueDescriptor(
  "clientToServer",
  PROTOCOL_COMPAT_DESCRIPTOR.clientToServer,
);
assertUniqueDescriptor(
  "serverToClient",
  PROTOCOL_COMPAT_DESCRIPTOR.serverToClient,
);

const ClientToServerMessageSchema = z.discriminatedUnion(
  "t",
  ClientToServerMessageSchemaOptions,
);

const ServerToClientMessageSchema = z.discriminatedUnion(
  "t",
  ServerToClientMessageSchemaOptions,
);

export type MoveIntentKey = z.infer<typeof MoveIntentKeySchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type InputMovement = z.infer<typeof InputMovementSchema>;
export type InputIntentMessage = z.infer<typeof InputIntentMessageSchema>;
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
export type GameCompleteMessage = z.infer<typeof GameCompleteMessageSchema>;
export type GameOverMessage = z.infer<typeof GameOverMessageSchema>;
export type SpectateUpdateMessage = z.infer<typeof SpectateUpdateMessageSchema>;
type ClientToServerMessage =
  | HelloMessage
  | InputIntentMessage
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
  | LobbyStateMessage
  | GameCompleteMessage
  | GameOverMessage
  | SpectateUpdateMessage;

export function encodeClientToServerMessage(
  message: ClientToServerMessage,
): Uint8Array {
  const startedAt = performance.now();
  if (message.t === "input" && isCompactProtocolEnabled()) {
    const encoded = encodeMsgpack([
      PACKET_KIND_INPUT,
      compactInputMessage(message),
    ]);
    recordProtocolMetric(
      "client_encode",
      encoded.byteLength,
      performance.now() - startedAt,
    );
    return encoded;
  }
  const encoded = encodeMsgpack([PACKET_KIND_OBJECT, message]);
  recordProtocolMetric(
    "client_encode",
    encoded.byteLength,
    performance.now() - startedAt,
  );
  return encoded;
}

export function encodeServerToClientMessage(
  message: ServerToClientMessage,
): Uint8Array {
  const startedAt = performance.now();
  const encoded = encodeMsgpack([
    PACKET_KIND_SERVER,
    isCompactProtocolEnabled() ? compactServerMessage(message) : message,
  ]);
  recordProtocolMetric(
    "server_encode",
    encoded.byteLength,
    performance.now() - startedAt,
  );
  return encoded;
}

function isCompactProtocolEnabled(): boolean {
  const maybeProcess = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env?.IO_GAME_COMPACT_PROTOCOL !== "0";
}

type ParseServerMessageOptions = {
  validateSnapshots?: boolean;
};

function parseJson(rawMessage: string) {
  return parseJsonValue(rawMessage);
}

function decodePackedMessage(
  rawMessage: string | Uint8Array,
  metricKind: "client_decode" | "server_decode",
) {
  const startedAt = performance.now();
  const bytes =
    typeof rawMessage === "string"
      ? new TextEncoder().encode(rawMessage).byteLength
      : rawMessage.byteLength;
  if (typeof rawMessage === "string") {
    const parsed = parseJson(rawMessage);
    if (parsed === null) {
      recordProtocolDecodeFailure(metricKind, "invalid_json");
    }
    recordProtocolMetric(metricKind, bytes, performance.now() - startedAt);
    return parsed;
  }
  try {
    const decoded = decodeMsgpack(rawMessage);
    if (!Array.isArray(decoded)) {
      return decoded;
    }
    const [packetKind, payload] = decoded;
    if (packetKind === PACKET_KIND_OBJECT) {
      return payload;
    }
    if (packetKind === PACKET_KIND_INPUT && Array.isArray(payload)) {
      const expanded = expandInputMessage(payload);
      if (!expanded) {
        recordProtocolDecodeFailure(metricKind, "invalid_input_packet");
      }
      recordProtocolMetric(metricKind, bytes, performance.now() - startedAt);
      return expanded;
    }
    if (packetKind === PACKET_KIND_SERVER) {
      const expanded = expandServerMessage(payload);
      recordProtocolMetric(metricKind, bytes, performance.now() - startedAt);
      return expanded;
    }
    recordProtocolDecodeFailure(metricKind, "unknown_packet_kind");
    recordProtocolMetric(metricKind, bytes, performance.now() - startedAt);
    return decoded;
  } catch {
    recordProtocolDecodeFailure(metricKind, "invalid_msgpack");
    recordProtocolMetric(metricKind, bytes, performance.now() - startedAt);
    return null;
  }
}

function isSnapshotMessage(value: unknown): value is SnapshotMessage {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "t" in value &&
    (value as { t?: unknown }).t === "snapshot"
  );
}

export function parseClientToServerMessage(
  rawMessage: string | Uint8Array,
): ClientToServerMessage | null {
  const parsedJson = decodePackedMessage(rawMessage, "server_decode");
  if (parsedJson === null) {
    return null;
  }
  const parsedMessage = ClientToServerMessageSchema.safeParse(parsedJson);
  if (!parsedMessage.success) {
    recordProtocolDecodeFailure("server_decode", "invalid_schema");
  }
  return parsedMessage.success ? parsedMessage.data : null;
}

export function parseServerToClientMessage(
  rawMessage: string | Uint8Array,
  { validateSnapshots = true }: ParseServerMessageOptions = {},
): ServerToClientMessage | null {
  const parsedJson = decodePackedMessage(rawMessage, "client_decode");
  if (parsedJson === null) {
    return null;
  }
  if (!validateSnapshots && isSnapshotMessage(parsedJson)) {
    return parsedJson;
  }
  const parsedMessage = ServerToClientMessageSchema.safeParse(parsedJson);
  if (!parsedMessage.success) {
    recordProtocolDecodeFailure("client_decode", "invalid_schema");
  }
  return parsedMessage.success ? parsedMessage.data : null;
}

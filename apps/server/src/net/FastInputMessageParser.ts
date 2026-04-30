import { isJsonObject, isJsonValue, parseJsonValue } from "@shared/json.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import type {
  InputIntentMessage,
  MoveIntentKey,
} from "@shared/net/protocol.ts";

type FastInputMessageParseResult =
  | { kind: "input"; message: InputIntentMessage }
  | { kind: "other" }
  | { kind: "invalid" };

const MOVE_KEYS: ReadonlySet<MoveIntentKey> = new Set([
  "up",
  "down",
  "left",
  "right",
]);

export function parseFastInputMessage(
  rawMessage: string,
): FastInputMessageParseResult {
  // Most inbound traffic is high-frequency movement/aim input.
  if (!rawMessage.includes('"t":"input"')) {
    return { kind: "other" };
  }

  const parsed = parseJsonValue(rawMessage);
  if (!parsed || !isJsonObject(parsed) || parsed.t !== "input") {
    return { kind: "invalid" };
  }
  if ("x" in parsed || "y" in parsed) {
    return { kind: "invalid" };
  }

  const seq = parseNonNegativeInt(parsed.seq);
  const clientTimeMs =
    parsed.clientTimeMs === undefined
      ? undefined
      : parseFiniteNumber(parsed.clientTimeMs);
  const theta = parseFiniteNumber(parsed.theta);
  const movement = parsed.movement;
  if (
    seq === null ||
    clientTimeMs === null ||
    theta === null ||
    !isInputMovement(movement)
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "input",
    message: {
      t: "input",
      seq,
      ...(clientTimeMs === undefined ? {} : { clientTimeMs }),
      theta: normalizeAngle(theta),
      movement,
    },
  };
}

function parseNonNegativeInt(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return null;
  }
  return value;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function isInputMovement(
  value: unknown,
): value is InputIntentMessage["movement"] {
  if (!value || !isJsonValue(value) || !isJsonObject(value)) {
    return false;
  }
  for (const key of MOVE_KEYS) {
    if (typeof value[key] !== "boolean") {
      return false;
    }
  }
  return true;
}

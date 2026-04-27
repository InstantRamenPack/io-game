import { isJsonObject, isJsonValue, parseJsonValue } from "@shared/json.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import type { MoveIntentKey, PoseMessage } from "@shared/net/protocol.ts";

type FastInputMessageParseResult =
  | { kind: "pose"; message: PoseMessage }
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
  // Most inbound traffic is high-frequency pose updates.
  if (!rawMessage.includes('"t":"pose"')) {
    return { kind: "other" };
  }

  const parsed = parseJsonValue(rawMessage);
  if (!parsed || !isJsonObject(parsed) || parsed.t !== "pose") {
    return { kind: "invalid" };
  }

  const seq = parseNonNegativeInt(parsed.seq);
  const clientTimeMs = parseFiniteNumber(parsed.clientTimeMs);
  const x = parseFiniteNumber(parsed.x);
  const y = parseFiniteNumber(parsed.y);
  const theta = parseFiniteNumber(parsed.theta);
  const heldMovement = parsed.heldMovement;
  if (
    seq === null ||
    clientTimeMs === null ||
    x === null ||
    y === null ||
    theta === null ||
    !isHeldMovementState(heldMovement)
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "pose",
    message: {
      t: "pose",
      seq,
      clientTimeMs,
      x,
      y,
      theta: normalizeAngle(theta),
      heldMovement,
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

function isHeldMovementState(
  value: unknown,
): value is PoseMessage["heldMovement"] {
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

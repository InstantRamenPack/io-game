import { describe, test } from "bun:test";
import { parseFastInputMessage } from "@server/net/FastInputMessageParser.ts";
import { parseClientToServerMessage } from "@shared/net/protocol.ts";
import {
  makeTestRng,
  rngBool,
  rngFloat,
  rngInt,
  rngPick,
} from "../helpers/testRng.ts";

const movementKeys = ["up", "down", "left", "right"] as const;

function makeMovement(rng: ReturnType<typeof makeTestRng>) {
  return {
    up: rngBool(rng),
    down: rngBool(rng),
    left: rngBool(rng),
    right: rngBool(rng),
  };
}

function buildRawMessage(rng: ReturnType<typeof makeTestRng>): string {
  const mode = rngInt(rng, 0, 9);
  if (mode === 9) {
    return "{";
  }
  if (mode === 8) {
    return JSON.stringify({ t: "hello", compatHash: "abc" });
  }

  const payload: Record<string, unknown> = {
    t: "input",
    seq: rngInt(rng, 0, 500),
    theta: rngFloat(rng, -20, 20),
    movement: makeMovement(rng),
  };

  if (rngBool(rng)) {
    payload.clientTimeMs = rngFloat(rng, 0, 5000);
  }

  switch (mode) {
    case 0:
      payload.seq = -1;
      break;
    case 1:
      payload.seq = rngFloat(rng, 0, 10) + 0.5;
      break;
    case 2:
      delete payload.movement;
      break;
    case 3:
      if (typeof payload.movement === "object" && payload.movement) {
        delete (payload.movement as Record<string, unknown>)[
          rngPick(rng, movementKeys)
        ];
      }
      break;
    case 4:
      if (typeof payload.movement === "object" && payload.movement) {
        (payload.movement as Record<string, unknown>).extra = true;
      }
      break;
    case 5:
      payload.theta = "oops";
      break;
    case 6:
      payload.x = rngFloat(rng, 0, 100);
      break;
    case 7:
      payload.t = "pose";
      break;
  }

  return JSON.stringify(payload);
}

describe("fast input parser equivalence", () => {
  test.each([1, 2, 3, 7, 13])("seed %s", (seed) => {
    const rng = makeTestRng(seed);
    for (let index = 0; index < 200; index += 1) {
      const raw = buildRawMessage(rng);
      const full = parseClientToServerMessage(raw);
      const fast = parseFastInputMessage(raw);
      const containsInputTag = raw.includes('"t":"input"');

      if (full?.t === "input") {
        if (fast.kind !== "input") {
          throw new Error(
            `seed ${seed} case ${index}: expected fast input, got ${fast.kind}`,
          );
        }
        if (fast.kind === "input") {
          if (fast.message.seq !== full.seq) {
            throw new Error(
              `seed ${seed} case ${index}: seq mismatch ${fast.message.seq} vs ${full.seq}`,
            );
          }
          if (fast.message.theta !== full.theta) {
            throw new Error(
              `seed ${seed} case ${index}: theta mismatch ${fast.message.theta} vs ${full.theta}`,
            );
          }
          if (
            JSON.stringify(fast.message.movement) !==
            JSON.stringify(full.movement)
          ) {
            throw new Error(
              `seed ${seed} case ${index}: movement mismatch ${JSON.stringify(
                fast.message.movement,
              )}`,
            );
          }
        }
        continue;
      }

      if (fast.kind === "input") {
        throw new Error(
          `seed ${seed} case ${index}: fast accepted input when full parser rejected`,
        );
      }

      if (containsInputTag) {
        if (fast.kind !== "invalid") {
          throw new Error(
            `seed ${seed} case ${index}: expected invalid for input tag, got ${fast.kind}`,
          );
        }
      } else if (fast.kind !== "other") {
        throw new Error(
          `seed ${seed} case ${index}: expected other, got ${fast.kind}`,
        );
      }
    }
  });
});

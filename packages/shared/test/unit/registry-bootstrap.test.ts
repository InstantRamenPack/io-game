import { describe, expect, test } from "bun:test";
import {
  parseClientToServerMessage,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";

describe("Protocol parsing", () => {
  test("accepts valid client input messages", () => {
    const message = parseClientToServerMessage(
      JSON.stringify({
        t: "input",
        cmd: {
          seq: 1,
          tick: 2,
          moveX: 0,
          moveY: 1,
        },
      }),
    );

    expect(message).not.toBeNull();
    expect(message?.t).toBe("input");
  });

  test("rejects malformed server messages", () => {
    const message = parseServerToClientMessage(
      JSON.stringify({ t: "snapshot", snapshot: { tick: 1 } }),
    );
    expect(message).toBeNull();
  });
});

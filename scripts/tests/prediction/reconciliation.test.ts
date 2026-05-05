import { describe, test } from "bun:test";

describe("client reconciliation", () => {
  test.todo(
    "authoritative reset then replay yields correct final state",
    () => {},
  );
  test.todo("acked inputs not replayed", () => {});
  test.todo("unacked inputs replayed in order", () => {});
  test.todo("no pending inputs means local equals authoritative", () => {});
  test.todo("small error produces smooth correction offset", () => {});
  test.todo("large error snaps immediately", () => {});
  test.todo("prediction disabled equals authoritative, no replay", () => {});
  test.todo("dead player skips replay", () => {});
  test.todo("respawn/discontinuity resets queue or snaps", () => {});
  test.todo("stale snapshot ignored, no reconciliation", () => {});
});

import { describe, test } from "bun:test";

describe("pending input queue", () => {
  test.todo("record input seq 1 increments pending count");
  test.todo("record seq 1,2,3 then ack 2 leaves seq 3");
  test.todo("ack -1 removes nothing");
  test.todo("ack higher than all pending clears queue");
  test.todo("duplicate seq sent accidentally has deterministic behavior");
  test.todo("out-of-order pending insertion handled deterministically");
  test.todo("maxPendingInputs exceeded prunes oldest");
  test.todo("maxClientPredictionMs exceeded prunes stale inputs");
  test.todo("reset on disconnect clears queue");
  test.todo("reset on session migration clears queue");
  test.todo("reset on welcome/new player clears queue");
});

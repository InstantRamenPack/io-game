import { describe, test } from "bun:test";

describe("prediction movement parity", () => {
  test.todo("no input produces zero velocity");
  test.todo("right input produces positive x");
  test.todo("left input produces negative x");
  test.todo("up input produces negative y");
  test.todo("down input produces positive y");
  test.todo("right+down normalizes magnitude");
  test.todo("left+right cancels x");
  test.todo("up+down cancels y");
  test.todo("all four directions cancel deterministically");
  test.todo("stunned yields zero movement");
  test.todo("speed multiplier scales speed");
  test.todo("dead player has no prediction");
});

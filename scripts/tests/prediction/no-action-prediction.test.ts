import { describe, test } from "bun:test";

describe("no client prediction for authoritative actions", () => {
  test.todo("attack action does not apply local damage");
  test.todo("build action does not permanently spawn structures");
  test.todo("craft action does not mutate inventory until snapshot");
  test.todo("drop action does not permanently drop until snapshot");
  test.todo("pickup action does not remove items until snapshot");
  test.todo("rejected action produces no ghost state");
  test.todo("duplicate action sequence does not double apply");
});

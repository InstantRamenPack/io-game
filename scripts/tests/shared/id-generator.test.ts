import { describe, expect, test } from "bun:test";
import { IdGenerator } from "@shared/math/IdGenerator.ts";

describe("IdGenerator", () => {
  test("freed ids are not reused within the same match", () => {
    const ids = new IdGenerator();

    const despawnedEntityId = ids.alloc();
    ids.free(despawnedEntityId);

    expect(ids.alloc()).toBe(2);
  });
});

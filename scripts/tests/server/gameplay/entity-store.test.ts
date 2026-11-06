import { expect, test } from "bun:test";
import { Entity } from "@server/entities/Entity.ts";
import { EntityStore } from "@server/world/EntityStore.ts";

class Actor extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";
  constructor(id: number) {
    super(id, { maxHp: 1 });
  }
}
class Shot extends Entity {
  public static readonly kind = "projectile" as const;
  public static override readonly resourceName = "basic_bullet";
  constructor(id: number) {
    super(id, { maxHp: 1 });
  }
}

test("projectile churn preserves unrelated class views but invalidates matching views", () => {
  const store = new EntityStore();
  const actor = new Actor(1);
  store.add(actor);
  const actors = store.queryInstances(Actor);
  const shots = store.queryInstances(Shot);
  store.add(new Shot(2));
  expect(store.queryInstances(Actor)).toBe(actors);
  expect(store.queryInstances(Shot)).not.toBe(shots);
  store.remove(2);
  expect(store.queryInstances(Actor)).toBe(actors);
  expect(store.queryInstances(Shot)).toHaveLength(0);
  // Replacing an ID must invalidate both its old and its new class view.
  store.add(new Shot(1));
  expect(store.queryInstances(Actor)).toHaveLength(0);
  expect(store.queryInstances(Shot)).toHaveLength(1);
  expect(store.all()).toEqual(store.queryInstances(Shot));
});

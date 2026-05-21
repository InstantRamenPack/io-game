import { beforeAll, describe, expect, test } from "bun:test";
import { requireEntityContent } from "@shared/content/catalog.ts";
import { Player } from "@server/entities/Player.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("player passive healing", () => {
  beforeAll(bootstrapTestRegistries);

  test("starts after out-of-combat delay and heals at configured rate", () => {
    const passiveHealing = requireEntityContent(Player.typeId).player
      ?.passiveHealing;
    expect(passiveHealing).toBeDefined();
    if (!passiveHealing) {
      return;
    }

    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "healing-test");

    player.hp = Math.max(1, player.maxHp - 5);
    player.lastDamageTick = runtime.world.tick;
    const hpBefore = player.hp;

    tick(runtime, passiveHealing.outOfCombatTicks - 1);
    expect(player.hp).toBe(hpBefore);

    let ticksUntilFirstHeal = 0;
    while (player.hp === hpBefore && ticksUntilFirstHeal < 500) {
      tick(runtime, 1);
      ticksUntilFirstHeal += 1;
    }

    expect(player.hp).toBe(hpBefore + 1);

    const expectedTicksUntilFirstHeal = Math.ceil(1 / passiveHealing.hpPerTick);
    expect(ticksUntilFirstHeal).toBe(expectedTicksUntilFirstHeal);
  });
});

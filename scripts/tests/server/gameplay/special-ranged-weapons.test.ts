import { describe, expect, test } from "bun:test";
import { FirecrackerBullet } from "@server/entities/projectiles/FirecrackerBullet.ts";
import { ShotgunPellet } from "@server/entities/projectiles/ShotgunPellet.ts";
import { SmallFirecrackerBullet } from "@server/entities/projectiles/SmallFirecrackerBullet.ts";
import { FirecrackerGun } from "@server/items/weapons/FirecrackerGun.ts";
import { Shotgun } from "@server/items/weapons/Shotgun.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

describe("special ranged weapons", () => {
  test("shotgun spends one shell to fire ten pellets across a 60 degree arc", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const shotgun = new Shotgun();

    expect(shotgun.hit(runtime.world, player, 0)).toBe(true);

    const pellets = runtime.world.entities
      .all()
      .filter((entity) => entity instanceof ShotgunPellet) as ShotgunPellet[];
    expect(pellets).toHaveLength(10);
    expect(shotgun.ammoInMag).toBe(4);
    expect(pellets[0]?.rotation).toBeCloseTo(-Math.PI / 6);
    expect(pellets[9]?.rotation).toBeCloseTo(Math.PI / 6);
  });

  test("firecracker gun kicks the shooter back and splits after 400 units", () => {
    bootstrapTestRegistries();
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 6000, 100);
    const gun = new FirecrackerGun();

    expect(gun.hit(runtime.world, player, 0)).toBe(true);
    expect(player.vx).toBeLessThan(0);

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof FirecrackerBullet),
    ).toHaveLength(1);

    tick(runtime, 8);

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof FirecrackerBullet),
    ).toHaveLength(0);
    const sparks = runtime.world.entities
      .all()
      .filter(
        (entity) => entity instanceof SmallFirecrackerBullet,
      ) as SmallFirecrackerBullet[];
    expect(sparks).toHaveLength(5);
    expect(sparks[0]?.rotation).toBeCloseTo(-Math.PI / 6);
    expect(sparks[4]?.rotation).toBeCloseTo(Math.PI / 6);
  });
});

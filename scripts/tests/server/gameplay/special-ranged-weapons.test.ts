import { beforeAll, describe, expect, test } from "bun:test";
import { requireProjectileContent } from "@shared/content/catalog.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { ContentProjectile } from "@server/entities/projectiles/ContentProjectile.ts";
import { FirecrackerBullet } from "@server/entities/projectiles/FirecrackerBullet.ts";
import {
  ShotgunPellet,
  SmallFirecrackerBullet,
} from "@server/registry/generated/contentProjectileCtors.ts";
import { FirecrackerGun } from "@server/items/weapons/FirecrackerGun.ts";
import { Shotgun } from "@server/items/weapons/Shotgun.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  spawnPlayerLikeDynamic,
  tick,
} from "@tests/helpers/worldFixtures.ts";

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

describe("special ranged weapons", () => {
  beforeAll(bootstrapTestRegistries);

  test("special ranged behavior follows authored weapon and projectile tuning", () => {
    const shotgunContent = requireShootWeaponRuntime("item:shotgun");
    const firecrackerGunContent = requireShootWeaponRuntime(
      "item:firecracker_gun",
    );
    const firecrackerProjectileContent = requireProjectileContent(
      "projectile:firecracker_bullet",
    );
    const originalShotgunSpecial = shotgunContent.special;
    const originalFirecrackerSpecial = firecrackerGunContent.special;
    const originalFirecrackerSplit = firecrackerProjectileContent.split;

    try {
      shotgunContent.special = {
        kind: "shotgunFan",
        projectileCount: 3,
        arcDeg: 30,
      };
      firecrackerGunContent.special = {
        kind: "firecrackerLauncher",
        selfKnockback: 9,
      };
      firecrackerProjectileContent.split = {
        projectileTypeId: "projectile:small_firecracker_bullet",
        projectileCount: 3,
        arcDeg: 30,
      };

      const { runtime } = makeRuntime();
      const shotgunPlayer = spawnPlayerLikeDynamic(runtime, 100, 100);
      const shotgun = new Shotgun();

      expect(shotgun.hit(runtime.world, shotgunPlayer, 0)).toBe(true);
      const pellets = runtime.world.entities
        .all()
        .filter(
          (entity) => entity instanceof ShotgunPellet,
        ) as ContentProjectile[];
      expect(pellets).toHaveLength(3);
      expect(pellets[0]?.rotation).toBeCloseTo(-Math.PI / 12);
      expect(pellets[2]?.rotation).toBeCloseTo(Math.PI / 12);

      const firecrackerPlayer = spawnPlayerLikeDynamic(runtime, 6000, 100);
      const gun = new FirecrackerGun();
      expect(gun.hit(runtime.world, firecrackerPlayer, 0)).toBe(true);
      expect(firecrackerPlayer.vx).toBeCloseTo(-9);

      tick(runtime, 6);

      const sparks = runtime.world.entities
        .all()
        .filter(
          (entity) => entity instanceof SmallFirecrackerBullet,
        ) as ContentProjectile[];
      expect(sparks).toHaveLength(3);
      expect(sparks[0]?.rotation).toBeCloseTo(-Math.PI / 12);
      expect(sparks[2]?.rotation).toBeCloseTo(Math.PI / 12);
    } finally {
      shotgunContent.special = originalShotgunSpecial;
      firecrackerGunContent.special = originalFirecrackerSpecial;
      firecrackerProjectileContent.split = originalFirecrackerSplit;
    }
  });

  test("shotgun spends one shell to fire the authored pellet fan", () => {
    const weaponContent = requireShootWeaponRuntime("item:shotgun");
    expect(weaponContent.special?.kind).toBe("shotgunFan");
    const special =
      weaponContent.special?.kind === "shotgunFan"
        ? weaponContent.special
        : null;
    expect(special).not.toBeNull();
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 100, 100);
    const shotgun = new Shotgun();

    expect(shotgun.hit(runtime.world, player, 0)).toBe(true);

    const pellets = runtime.world.entities
      .all()
      .filter(
        (entity) => entity instanceof ShotgunPellet,
      ) as ContentProjectile[];
    expect(pellets).toHaveLength(special?.projectileCount ?? 0);
    expect(shotgun.ammoInMag).toBe(4);
    expect(pellets[0]?.rotation).toBeCloseTo(
      -radians(special?.arcDeg ?? 0) / 2,
    );
    expect(pellets.at(-1)?.rotation).toBeCloseTo(
      radians(special?.arcDeg ?? 0) / 2,
    );
  });

  test("firecracker gun kicks the shooter back and splits at authored range", () => {
    const weaponContent = requireShootWeaponRuntime("item:firecracker_gun");
    const projectileContent = requireProjectileContent(
      "projectile:firecracker_bullet",
    );
    expect(weaponContent.special?.kind).toBe("firecrackerLauncher");
    const special =
      weaponContent.special?.kind === "firecrackerLauncher"
        ? weaponContent.special
        : null;
    expect(special).not.toBeNull();
    expect(projectileContent.split).toBeDefined();
    const { runtime } = makeRuntime();
    const player = spawnPlayerLikeDynamic(runtime, 6000, 100);
    const gun = new FirecrackerGun();

    expect(gun.hit(runtime.world, player, 0)).toBe(true);
    expect(player.vx).toBeCloseTo(-(special?.selfKnockback ?? 0));

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof FirecrackerBullet),
    ).toHaveLength(1);

    tick(runtime, Math.ceil(projectileContent.range / projectileContent.speed));

    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity instanceof FirecrackerBullet),
    ).toHaveLength(0);
    const sparks = runtime.world.entities
      .all()
      .filter(
        (entity) => entity instanceof SmallFirecrackerBullet,
      ) as ContentProjectile[];
    expect(sparks).toHaveLength(projectileContent.split?.projectileCount ?? 0);
    expect(sparks[0]?.rotation).toBeCloseTo(
      -radians(projectileContent.split?.arcDeg ?? 0) / 2,
    );
    expect(sparks.at(-1)?.rotation).toBeCloseTo(
      radians(projectileContent.split?.arcDeg ?? 0) / 2,
    );
  });
});

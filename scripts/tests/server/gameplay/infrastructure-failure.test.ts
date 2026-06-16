import { beforeAll, describe, expect, test } from "bun:test";
import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { CommsTower } from "@server/entities/tower/CommsTower.ts";
import { EnergyTower } from "@server/entities/tower/EnergyTower.ts";
import { CannonGun } from "@server/items/weapons/CannonGun.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

describe("infrastructure failure loop", () => {
  beforeAll(bootstrapTestRegistries);

  test("extraction starts active before any wave progression", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);

    runtime.tick();

    const snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    expect(snapshot.infrastructure.commsActive).toBe(true);
    expect(snapshot.extraction.stage).toBe("active");
    expect(snapshot.extraction.lockedReason).toBeUndefined();
  });

  test("comms failure locks extraction in authoritative snapshots", () => {
    const { runtime } = makeRuntime();
    const { playerId } = connectTestClient(runtime);
    const commsTower = runtime.world.entities.queryInstances(CommsTower).at(0);
    expect(commsTower).toBeDefined();
    if (!commsTower) {
      throw new Error("expected comms tower");
    }

    commsTower.alive = false;
    Object.assign(runtime.world.waveSystem, { nightCycleCounter: 7 });
    runtime.tick();

    const snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    expect(snapshot.infrastructure.commsActive).toBe(false);
    expect(snapshot.extraction.stage).toBe("locked");
    expect(snapshot.extraction.lockedReason).toBe("comms_offline");
  });

  test("energy failure disables powered defenses in server authority", () => {
    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const energyTower = runtime.world.entities
      .queryInstances(EnergyTower)
      .at(0);
    expect(energyTower).toBeDefined();
    if (!energyTower) {
      throw new Error("expected energy tower");
    }

    const cannon = new Cannon(runtime.world.allocEntityId(), 1, playerId);
    cannon.x = player.x + 160;
    cannon.y = player.y;
    runtime.world.spawn(cannon);

    expect(cannon.getCombatInstigator(runtime.world)).toBe(player);
    energyTower.alive = false;
    runtime.tick();

    expect(runtime.world.infrastructureSystem?.isEnergyActive()).toBe(false);
    expect(cannon.getCombatInstigator(runtime.world)).toBeNull();
  });

  test("cannon gun tuning comes from building content", () => {
    const content = getEntityContent(makeResourceId("building", "cannon"))
      ?.capabilities?.turretWeapon;
    expect(content?.attackStyle).toBe("shoot");
    if (!content) {
      throw new Error("expected cannon turret weapon content");
    }

    const { runtime } = makeRuntime();
    const { player, playerId } = connectTestClient(runtime);
    const cannon = new Cannon(runtime.world.allocEntityId(), 1, playerId);
    cannon.x = player.x + 160;
    cannon.y = player.y;
    runtime.world.spawn(cannon);

    const weapon = cannon.weapons[0];
    expect(weapon).toBeInstanceOf(CannonGun);
    if (!(weapon instanceof CannonGun)) {
      throw new Error("expected cannon gun");
    }

    expect(weapon.projectileTypeId).toBe(content.projectileTypeId);
    expect(weapon.magSize).toBe(content.magSize);
    expect(weapon.reloadTicks).toBe(content.reloadTicks);
    expect(weapon.spread).toBe((content.spreadDeg * Math.PI) / 180);

    expect(weapon.hit(runtime.world, cannon, 0)).toBe(true);
    expect(weapon.toSnapshot().cooldownTicksRemaining).toBe(
      content.cooldownTicks,
    );
  });
});

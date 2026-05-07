import { Player } from "@server/entities/Player.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import type { ProceduralRect } from "@shared/world/ProceduralWorld.ts";

const ENVIRONMENT_DAMAGE_SOURCE_ID = 0;
const FALLBACK_HOME_CORE_WIDTH = 760;
const FALLBACK_HOME_CORE_HEIGHT = 520;

type NightStormSystemConfig = {
  tickRate: number;
  damage: number;
  intervalMs: number;
};

export class NightStormSystem implements System {
  private readonly damage: number;
  private readonly intervalTicks: number;
  private readonly outsideExposureTicksByPlayerId = new Map<number, number>();

  constructor(config: NightStormSystemConfig) {
    this.damage = Math.max(0, config.damage);
    this.intervalTicks = Math.max(
      1,
      Math.round((Math.max(1, config.intervalMs) * config.tickRate) / 1000),
    );
  }

  public update(world: World, _deltaMs: number): void {
    if (this.damage <= 0 || !world.dayNightSystem.isNight()) {
      this.outsideExposureTicksByPlayerId.clear();
      return;
    }

    const homeSafeZone = this.resolveHomeSafeZone(world);
    if (!homeSafeZone) {
      this.outsideExposureTicksByPlayerId.clear();
      return;
    }

    const activePlayerIds = new Set<number>();
    for (const player of world.entities.queryInstances(Player)) {
      activePlayerIds.add(player.id);
      if (!player.alive) {
        this.outsideExposureTicksByPlayerId.delete(player.id);
        continue;
      }

      if (isPointInsideRect(player.x, player.y, homeSafeZone)) {
        this.outsideExposureTicksByPlayerId.delete(player.id);
        continue;
      }

      const accumulatedTicks =
        (this.outsideExposureTicksByPlayerId.get(player.id) ?? 0) + 1;
      if (accumulatedTicks < this.intervalTicks) {
        this.outsideExposureTicksByPlayerId.set(player.id, accumulatedTicks);
        continue;
      }

      player.applyDamage(world, this.damage, ENVIRONMENT_DAMAGE_SOURCE_ID);
      if (player.alive && world.entities.has(player.id)) {
        this.outsideExposureTicksByPlayerId.set(
          player.id,
          accumulatedTicks - this.intervalTicks,
        );
      } else {
        this.outsideExposureTicksByPlayerId.delete(player.id);
      }
    }

    for (const playerId of [...this.outsideExposureTicksByPlayerId.keys()]) {
      if (!activePlayerIds.has(playerId)) {
        this.outsideExposureTicksByPlayerId.delete(playerId);
      }
    }
  }

  private resolveHomeSafeZone(world: World): ProceduralRect | null {
    const layout = world.proceduralLayout;
    if (!layout) {
      const { w, h } = world.gameConfig.worldSize;
      return {
        minX: w / 2 - FALLBACK_HOME_CORE_WIDTH / 2,
        minY: h / 2 - FALLBACK_HOME_CORE_HEIGHT / 2,
        maxX: w / 2 + FALLBACK_HOME_CORE_WIDTH / 2,
        maxY: h / 2 + FALLBACK_HOME_CORE_HEIGHT / 2,
      };
    }

    const homeSector = layout.sectors.find(
      (sector) => sector.archetype === "home",
    );
    const spawnCore = homeSector?.features.find(
      (feature) => feature.role === "spawn_core",
    );
    return spawnCore ?? layout.homeBounds;
  }
}

function isPointInsideRect(
  x: number,
  y: number,
  rect: ProceduralRect,
): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

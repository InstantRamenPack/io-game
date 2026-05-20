import { COMPAT_HASH } from "@shared/config/compat.ts";
import {
  dayNightConfig,
  runtimeConfig,
} from "@shared/config/gameplayConfig.ts";

/**
 * Shared runtime configuration used by both server and client.
 * Values are loaded from strict shared JSON config.
 */
export class GameConfig {
  public tickRate = runtimeConfig.tickRate;
  public worldSize = { ...runtimeConfig.worldSize };
  public collision = { ...runtimeConfig.collision };
  public network = { ...runtimeConfig.network };
  public replication = { ...runtimeConfig.replication };
  public debug = {
    spawnMultiplier: runtimeConfig.debug.spawnMultiplier,
    focusedTrace: { ...runtimeConfig.debug.focusedTrace },
  };
  public interpolation = { ...runtimeConfig.interpolation };
  public dayNight = {
    dayDurationMs: dayNightConfig.dayDurationMs,
    nightDurationMs: dayNightConfig.nightDurationMs,
    stormDamage: { ...dayNightConfig.stormDamage },
  };
  public compatHash = COMPAT_HASH;

  /**
   * Creates a config instance from the shared JSON-backed defaults.
   * @returns Loaded runtime configuration.
   */
  public static load(): GameConfig {
    return new GameConfig();
  }
}

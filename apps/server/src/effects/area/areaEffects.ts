import { Player } from "@server/entities/Player.ts";
import { Wall } from "@server/registry/generated/buildingCtors.ts";
import { RadialAreaEffect } from "@server/effects/area/RadialAreaEffect.ts";

export const bomberExplosion = new RadialAreaEffect({
  radius: 100,
  damage: 200,
  style: "wallbreaker",
});
export const droneExplosion = new RadialAreaEffect({
  radius: 96,
  damage: 35,
  knockback: 18,
  falloff: true,
  style: "drone",
});
export const landmineExplosion = new RadialAreaEffect({
  radius: 140,
  damage: 80,
  knockback: 32,
  falloff: true,
  stun: true,
  style: "landmine",
});
export const megaknightSlam = new RadialAreaEffect({
  radius: 80,
  damage: 40,
  knockback: 25,
});
export const wallbreakerExplosion = new RadialAreaEffect({
  radius: 90,
  damage: (target) =>
    target instanceof Wall || target instanceof Player ? 200 : 80,
  style: "wallbreaker",
});

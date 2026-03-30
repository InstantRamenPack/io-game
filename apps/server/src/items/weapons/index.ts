import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { CannonGun } from "@server/items/weapons/CannonGun.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { Taser } from "@server/items/weapons/Taser.ts";

export { BasicGun } from "@server/items/weapons/BasicGun.ts";
export { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
export { BasicSword } from "@server/items/weapons/BasicSword.ts";
export { CannonGun } from "@server/items/weapons/CannonGun.ts";
export { Crossbow } from "@server/items/weapons/Crossbow.ts";
export { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
export { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";
export { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
export { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
export { Taser } from "@server/items/weapons/Taser.ts";

export const weaponItemTypes = [
  BasicGun,
  BasicSpear,
  BasicSword,
  Crossbow,
  DroneShooter,
  SpikedSpear,
  Taser,
  ZombieSword,
  SaboteurSword,
] as const;

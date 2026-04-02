import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
import { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
import { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";

export { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
export { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
export { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";
export { HomingDrone } from "@server/entities/projectiles/HomingDrone.ts";
export { RifleBullet } from "@server/entities/projectiles/RifleBullet.ts";

export const projectileEntityTypes = [
  BasicBullet,
  CannonBullet,
  CrossbowArrow,
  HomingDrone,
  RifleBullet,
] as const;

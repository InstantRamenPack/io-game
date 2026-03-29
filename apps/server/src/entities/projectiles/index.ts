import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
import { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";

export { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
export { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";
export { CrossbowArrow } from "@server/entities/projectiles/CrossbowArrow.ts";

export const projectileEntityTypes = [
  BasicBullet,
  CannonBullet,
  CrossbowArrow,
] as const;

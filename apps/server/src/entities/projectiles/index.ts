import { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
import { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";

export { BasicBullet } from "@server/entities/projectiles/BasicBullet.ts";
export { CannonBullet } from "@server/entities/projectiles/CannonBullet.ts";

export const projectileEntityTypes = [BasicBullet, CannonBullet] as const;

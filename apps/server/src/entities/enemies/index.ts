import { Skeleton } from "@server/entities/enemies/Skeleton.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";

export { Skeleton } from "@server/entities/enemies/Skeleton.ts";
export { Zombie } from "@server/entities/enemies/Zombie.ts";

export const enemyEntityTypes = [Zombie, Skeleton] as const;

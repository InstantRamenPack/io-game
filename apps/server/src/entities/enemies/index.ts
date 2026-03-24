import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Skeleton } from "@server/entities/enemies/Skeleton.ts";
import { Zombie } from "@server/entities/enemies/Zombie.ts";

export const enemyEntityTypes = [Zombie, Skeleton, Megaknight, Saboteur] as const;

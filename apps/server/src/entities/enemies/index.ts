import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";

export const enemyEntityTypes = [
  Drifter,
  Shoota,
  Megaknight,
  Saboteur,
] as const;

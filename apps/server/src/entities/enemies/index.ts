import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";

export const enemyEntityTypes = [
  Drifter,
  Shoota,
  Megaknight,
  Police,
  Saboteur,
  Wallbreaker,
] as const;

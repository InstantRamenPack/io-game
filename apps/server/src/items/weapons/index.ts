import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export { BasicGun } from "@server/items/weapons/BasicGun.ts";
export { BasicSword } from "@server/items/weapons/BasicSword.ts";
export { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export const weaponItemTypes = [BasicGun, BasicSword, ZombieSword] as const;

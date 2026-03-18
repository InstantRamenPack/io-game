Original prompt: PLEASE IMPLEMENT THIS PLAN: BasicGun via Projectile / BasicBullet

- Added server-side projectile scaffolding: `Projectile`, `BasicBullet`, `ProjectileSystem`, projectile registry, and world-owned entity id allocation.
- Wired ranged combat through `RangedWeapon.fire()` and added `BasicGun` to the player starting loadout in slot 1.
- Added protocol/input support for `selectSlot` and started the client HUD/render updates for gun ammo and projectile visibility.
- `bun run typecheck` passes after formatting.
- Browser-level smoke was blocked because Playwright browsers are not installed and you declined installing them.
- Fallback runtime verification passed through an inline Bun simulation against `GameServer`: bullet spawn, bullet hit/despawn, range expiry, reload, slot switching, melee damage, and zombie retaliation all succeeded.

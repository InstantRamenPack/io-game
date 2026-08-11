import { Player } from "@server/entities/Player.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ChatCommandHandlerFactory } from "@server/chat/commands/types.ts";
import { Structure } from "@server/entities/Structure.ts";

export const createAdminCommandHandlers: ChatCommandHandlerFactory = (
  context,
) => ({
  spawn: (clientId, player, args) => {
    if (args.length === 0) {
      context.sendSystem(
        clientId,
        "Usage: /spawn <entity> [amount] [@a|player|x y z]",
      );
      return;
    }

    const entityToken = args[0] ?? "";
    const resolvedEntry = context.resolveEntityEntry(entityToken);
    if (!resolvedEntry) {
      context.sendSystem(clientId, `Unknown entity "${entityToken}".`);
      return;
    }

    let amount = 1;
    let argIndex = 1;
    if (args[argIndex] && context.isIntegerLike(args[argIndex] ?? "")) {
      amount = Math.max(1, Math.floor(Number(args[argIndex])));
      argIndex += 1;
    }
    if (amount > context.getMaxSpawnAmount()) {
      context.sendSystem(
        clientId,
        `Spawn amount capped at ${context.getMaxSpawnAmount()}.`,
      );
      amount = context.getMaxSpawnAmount();
    }

    const spawnTarget = context.resolveSpawnTarget(
      player,
      args.slice(argIndex),
    );
    if (!spawnTarget) {
      context.sendSystem(
        clientId,
        "Usage: /spawn <entity> [amount] [@a|player|x y z]",
      );
      return;
    }

    const { x: spawnX, y: spawnY } = context.clampToWorldBounds(
      spawnTarget.x,
      spawnTarget.y,
    );

    let spawned = 0;
    for (let index = 0; index < amount; index += 1) {
      try {
        const entity = context.instantiateEntity(resolvedEntry, player, {
          x: spawnX,
          y: spawnY,
        });
        if (!entity) {
          break;
        }
        context.world.spawn(entity);
        spawned += 1;
      } catch (error) {
        console.error(`Failed to spawn ${resolvedEntry.typeId}:`, error);
        context.sendSystem(
          clientId,
          `Failed to spawn ${resolvedEntry.typeId}.`,
        );
        break;
      }
    }

    if (spawned > 0) {
      context.sendSystem(
        clientId,
        `Spawned ${spawned} ${resolvedEntry.typeId}.`,
      );
    }
  },
  kill: (clientId, _player, args) => {
    if (args.length === 0) {
      context.sendSystem(clientId, "Usage: /kill @e <entity> | @a | <player>");
      return;
    }

    const targetToken = args[0]?.toLowerCase() ?? "";
    if (targetToken === "@a") {
      const players = context.getOnlinePlayers();
      for (const targetPlayer of players) {
        context.killEntity(targetPlayer);
      }
      context.sendSystem(clientId, `Killed ${players.length} player(s).`);
      return;
    }

    if (targetToken === "@e") {
      if (args.length !== 2) {
        context.sendSystem(clientId, "Usage: /kill @e <entity>");
        return;
      }

      const entityToken = args[1] ?? "";
      const resolvedEntry = context.resolveEntityEntry(entityToken);
      if (!resolvedEntry) {
        context.sendSystem(clientId, `Unknown entity "${entityToken}".`);
        return;
      }
      if (resolvedEntry.kind === "structure") {
        context.sendSystem(clientId, "Structures are immutable in this build.");
        return;
      }

      let killed = 0;
      for (const entity of context.world.entities.all()) {
        if (entity.typeId !== resolvedEntry.typeId) {
          continue;
        }
        context.killEntity(entity);
        killed += 1;
      }

      if (killed === 0) {
        context.sendSystem(
          clientId,
          `No entities of type ${resolvedEntry.typeId} found.`,
        );
        return;
      }

      context.sendSystem(clientId, `Killed ${killed} ${resolvedEntry.typeId}.`);
      return;
    }

    const targetName = args.join(" ");
    const targetPlayer = context.findPlayerByName(targetName);
    if (!targetPlayer) {
      context.sendSystem(clientId, `No player named "${targetName}" found.`);
      return;
    }
    context.killEntity(targetPlayer);
    context.sendSystem(clientId, `Killed ${targetPlayer.name}.`);
  },
  killall: (clientId) => {
    const entities = context.world.entities.all();
    let killed = 0;
    for (const entity of entities) {
      if (entity.maxHp === 0 || entity instanceof Structure) continue;
      context.killEntity(entity);
      killed += 1;
    }
    context.sendSystem(clientId, `Killed ${killed} entities.`);
  },
  effect: (clientId, player, args) => {
    if (args.length === 0) {
      context.sendSystem(clientId, "Usage: /effect <effect> [@a|@e|player]");
      return;
    }

    const effectToken = args[0] ?? "";
    const effectEntry = context.resolveEffectEntry(effectToken);
    if (!effectEntry) {
      context.sendSystem(clientId, `Unknown effect "${effectToken}".`);
      return;
    }

    const targetToken = args[1]?.toLowerCase() ?? "@a";
    let targets: Entity[];
    if (targetToken === "@a") {
      targets = context.getOnlinePlayers();
    } else if (targetToken === "@e") {
      targets = context.world.entities.all();
    } else {
      const targetPlayer = context.findPlayerByName(args[1] ?? "");
      if (!targetPlayer) {
        context.sendSystem(
          clientId,
          `No player named "${args[1] ?? ""}" found.`,
        );
        return;
      }
      targets = [targetPlayer];
    }

    const effect = new effectEntry.ctor();
    for (const target of targets) {
      effect.apply(context.world, player, target);
    }

    context.sendSystem(
      clientId,
      `Applied ${effectEntry.typeId} to ${targets.length} target(s).`,
    );
  },
  give: (clientId, _player, args) => {
    if (args.length < 2) {
      context.sendSystem(clientId, "Usage: /give <@a|player> <item> [amount]");
      return;
    }

    const targetToken = args[0]?.toLowerCase() ?? "";
    const itemToken = args[1] ?? "";
    const itemEntry = context.resolveItemEntry(itemToken);
    if (!itemEntry) {
      context.sendSystem(clientId, `Unknown item "${itemToken}".`);
      return;
    }

    let amount = 1;
    if (args[2] && context.isIntegerLike(args[2] ?? "")) {
      amount = Math.max(1, Math.floor(Number(args[2])));
    }

    const targets =
      targetToken === "@a"
        ? context.getOnlinePlayers()
        : [context.findPlayerByName(args[0] ?? "")].filter(
            (target): target is Player => target instanceof Player,
          );
    if (targets.length === 0) {
      context.sendSystem(clientId, `No player named "${args[0] ?? ""}" found.`);
      return;
    }

    let grantedCount = 0;
    for (const target of targets) {
      if (!context.giveItemToPlayer(target, itemEntry, amount)) {
        continue;
      }
      grantedCount += 1;
    }

    if (grantedCount === 0) {
      context.sendSystem(
        clientId,
        `Unable to give ${itemEntry.typeId}; every target inventory is full.`,
      );
      return;
    }

    context.sendSystem(
      clientId,
      `Gave ${amount} ${itemEntry.typeId} to ${grantedCount} player(s).`,
    );
  },
  time: (clientId, _player, args) => {
    const action = (args[0] ?? "").toLowerCase();
    const targetPhase = (args[1] ?? "").toLowerCase();
    if (
      action !== "set" ||
      (targetPhase !== "day" && targetPhase !== "night")
    ) {
      context.sendSystem(clientId, "Usage: /time <set day|night>");
      return;
    }
    context.world.dayNightSystem.setPhase(targetPhase);
    context.sendSystem(clientId, `Time set to ${targetPhase}.`);
  },
});

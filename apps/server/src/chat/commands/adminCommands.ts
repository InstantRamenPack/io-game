import { writeFile } from "node:fs/promises";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";
import { isDebugAdminPlayerName } from "@server/content/serverContentCapabilities.ts";
import { Player } from "@server/entities/Player.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ChatCommandHandlerFactory } from "@server/chat/commands/types.ts";
import { Structure } from "@server/entities/Structure.ts";

const MAP_TILE_SIZE = 16;

type MapEditAction =
  | {
      kind: "spawn";
      typeId: string;
      x: number;
      y: number;
    }
  | {
      kind: "erase";
      typeId: string;
      x: number;
      y: number;
    };

export const createAdminCommandHandlers: ChatCommandHandlerFactory = (
  context,
) => {
  const undoStack: MapEditAction[] = [];
  const redoStack: MapEditAction[] = [];

  const clearRedo = (): void => {
    redoStack.length = 0;
  };

  const canUseMapEditor = (player: Player): boolean =>
    isDebugAdminPlayerName(player.name);

  const snapToTileCenter = (value: number): number =>
    Math.floor(value / MAP_TILE_SIZE) * MAP_TILE_SIZE + MAP_TILE_SIZE / 2;

  const parseCoordinate = (
    token: string | undefined,
    fallback: number,
  ): number | null => {
    if (!token) {
      return fallback;
    }
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  };

  const findStructureAt = (x: number, y: number): Structure | null => {
    for (const entity of context.world.entities.all()) {
      if (!(entity instanceof Structure)) {
        continue;
      }
      if (
        snapToTileCenter(entity.x) === snapToTileCenter(x) &&
        snapToTileCenter(entity.y) === snapToTileCenter(y)
      ) {
        return entity;
      }
    }
    return null;
  };

  const spawnStructure = (
    clientId: string,
    player: Player,
    structureToken: string,
    x: number,
    y: number,
  ): MapEditAction | null => {
    const entry = context.resolveEntityEntry(structureToken);
    if (!entry || entry.kind !== "structure") {
      context.sendSystem(clientId, `Unknown structure "${structureToken}".`);
      return null;
    }
    const spawned = context.instantiateEntity(entry, player, { x, y });
    if (!spawned) {
      context.sendSystem(clientId, `Unable to instantiate ${entry.typeId}.`);
      return null;
    }
    spawned.x = snapToTileCenter(x);
    spawned.y = snapToTileCenter(y);
    context.world.spawn(spawned);
    return {
      kind: "spawn",
      typeId: spawned.typeId,
      x: spawned.x,
      y: spawned.y,
    };
  };

  const eraseStructure = (x: number, y: number): MapEditAction | null => {
    const structure = findStructureAt(x, y);
    if (!structure) {
      return null;
    }
    const action: MapEditAction = {
      kind: "erase",
      typeId: structure.typeId,
      x: structure.x,
      y: structure.y,
    };
    context.world.despawn(structure.id);
    return action;
  };

  const applyMapActionForward = (
    clientId: string,
    player: Player,
    action: MapEditAction,
  ): boolean => {
    if (action.kind === "spawn") {
      return (
        spawnStructure(clientId, player, action.typeId, action.x, action.y) !==
        null
      );
    }

    return eraseStructure(action.x, action.y) !== null;
  };

  const applyMapActionReverse = (
    clientId: string,
    player: Player,
    action: MapEditAction,
  ): boolean => {
    if (action.kind === "spawn") {
      return eraseStructure(action.x, action.y) !== null;
    }

    return (
      spawnStructure(clientId, player, action.typeId, action.x, action.y) !==
      null
    );
  };

  const recordAction = (action: MapEditAction): void => {
    undoStack.push(action);
    clearRedo();
  };

  const applyAndRecordSpawn = (
    clientId: string,
    player: Player,
    structureToken: string,
    x: number,
    y: number,
  ): MapEditAction | null => {
    const action = spawnStructure(clientId, player, structureToken, x, y);
    if (!action) {
      return null;
    }
    recordAction(action);
    return action;
  };

  const applyAndRecordErase = (x: number, y: number): MapEditAction | null => {
    const action = eraseStructure(x, y);
    if (!action) {
      return null;
    }
    recordAction(action);
    return action;
  };

  const exportMap = async (): Promise<string> => {
    const structures = context.world.entities
      .all()
      .filter(
        (entity) =>
          getResourceNamespace(entity.typeId) === "structure" && entity.alive,
      )
      .map((entity) => ({
        typeId: entity.typeId,
        x: snapToTileCenter(entity.x),
        y: snapToTileCenter(entity.y),
      }))
      .sort((left, right) =>
        left.typeId === right.typeId
          ? left.y === right.y
            ? left.x - right.x
            : left.y - right.y
          : left.typeId.localeCompare(right.typeId),
      );

    const dungeonRooms = [...context.world.dungeonRoomsByZone.entries()].map(
      ([zoneId, rooms]) => ({
        zoneId,
        rooms: rooms
          .map((room) => ({
            id: room.id,
            roomType: room.roomType,
            minX: room.minX,
            minY: room.minY,
            maxX: room.maxX,
            maxY: room.maxY,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }),
    );

    const payload = {
      generatedAtMs: Date.now(),
      tileSize: MAP_TILE_SIZE,
      structures,
      dungeonRooms,
    };
    const outputPath = "./apps/server/src/config/world_map_export.json";
    await writeFile(outputPath, JSON.stringify(payload, null, 2));
    return outputPath;
  };

  return {
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
        context.sendSystem(
          clientId,
          "Usage: /kill @e <entity> | @a | <player>",
        );
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
          context.sendSystem(
            clientId,
            "Structures are immutable in this build.",
          );
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

        context.sendSystem(
          clientId,
          `Killed ${killed} ${resolvedEntry.typeId}.`,
        );
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
        context.sendSystem(
          clientId,
          "Usage: /give <@a|player> <item> [amount]",
        );
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
        context.sendSystem(
          clientId,
          `No player named "${args[0] ?? ""}" found.`,
        );
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
    map: (clientId, player, args) => {
      if (!canUseMapEditor(player)) {
        context.sendSystem(
          clientId,
          'Map editor is dev-only and restricted to player "debug".',
        );
        return;
      }

      const sub = (args[0] ?? "").toLowerCase();
      if (!sub) {
        context.sendSystem(
          clientId,
          "Usage: /map <place|erase|fill|tag|undo|redo|export> ...",
        );
        return;
      }

      if (sub === "place") {
        const token = args[1] ?? "";
        const x = parseCoordinate(args[2], player.x);
        const y = parseCoordinate(args[3], player.y);
        if (!token || x === null || y === null) {
          context.sendSystem(clientId, "Usage: /map place <structure> [x y]");
          return;
        }
        const action = applyAndRecordSpawn(clientId, player, token, x, y);
        if (!action) {
          return;
        }
        context.sendSystem(
          clientId,
          `Placed ${action.typeId} @ ${action.x},${action.y}.`,
        );
        return;
      }

      if (sub === "erase") {
        const x = parseCoordinate(args[1], player.x);
        const y = parseCoordinate(args[2], player.y);
        if (x === null || y === null) {
          context.sendSystem(clientId, "Usage: /map erase [x y]");
          return;
        }
        const action = applyAndRecordErase(x, y);
        if (!action) {
          context.sendSystem(clientId, "No structure at that tile.");
          return;
        }
        context.sendSystem(
          clientId,
          `Erased ${action.typeId} @ ${action.x},${action.y}.`,
        );
        return;
      }

      if (sub === "fill") {
        const token = args[1] ?? "";
        const x1 = parseCoordinate(args[2], player.x);
        const y1 = parseCoordinate(args[3], player.y);
        const x2 = parseCoordinate(args[4], player.x);
        const y2 = parseCoordinate(args[5], player.y);
        if (
          !token ||
          x1 === null ||
          y1 === null ||
          x2 === null ||
          y2 === null
        ) {
          context.sendSystem(
            clientId,
            "Usage: /map fill <structure> <x1> <y1> <x2> <y2>",
          );
          return;
        }

        const minX = Math.min(snapToTileCenter(x1), snapToTileCenter(x2));
        const maxX = Math.max(snapToTileCenter(x1), snapToTileCenter(x2));
        const minY = Math.min(snapToTileCenter(y1), snapToTileCenter(y2));
        const maxY = Math.max(snapToTileCenter(y1), snapToTileCenter(y2));
        let placed = 0;
        for (let y = minY; y <= maxY; y += MAP_TILE_SIZE) {
          for (let x = minX; x <= maxX; x += MAP_TILE_SIZE) {
            if (findStructureAt(x, y)) {
              continue;
            }
            const action = applyAndRecordSpawn(clientId, player, token, x, y);
            if (!action) {
              continue;
            }
            placed += 1;
          }
        }
        context.sendSystem(clientId, `Filled ${placed} tile(s).`);
        return;
      }

      if (sub === "tag") {
        const x = parseCoordinate(args[1], player.x);
        const y = parseCoordinate(args[2], player.y);
        const roomType = args.slice(3).join(" ").trim();
        if (x === null || y === null || !roomType) {
          context.sendSystem(clientId, "Usage: /map tag <x> <y> <roomType>");
          return;
        }

        for (const [
          zoneId,
          rooms,
        ] of context.world.dungeonRoomsByZone.entries()) {
          const room = rooms.find(
            (candidate) =>
              x >= candidate.minX &&
              x <= candidate.maxX &&
              y >= candidate.minY &&
              y <= candidate.maxY,
          );
          if (!room) {
            continue;
          }
          room.roomType = roomType;
          context.sendSystem(
            clientId,
            `Tagged ${zoneId}/${room.id} as ${roomType}.`,
          );
          return;
        }
        context.sendSystem(clientId, "No dungeon room at that position.");
        return;
      }

      if (sub === "undo") {
        const action = undoStack.pop();
        if (!action) {
          context.sendSystem(clientId, "Nothing to undo.");
          return;
        }
        if (applyMapActionReverse(clientId, player, action)) {
          redoStack.push(action);
        }
        context.sendSystem(clientId, "Undo complete.");
        return;
      }

      if (sub === "redo") {
        const action = redoStack.pop();
        if (!action) {
          context.sendSystem(clientId, "Nothing to redo.");
          return;
        }
        if (applyMapActionForward(clientId, player, action)) {
          undoStack.push(action);
        }
        context.sendSystem(clientId, "Redo complete.");
        return;
      }

      if (sub === "export") {
        void exportMap()
          .then((outputPath) => {
            context.sendSystem(clientId, `Exported map to ${outputPath}.`);
          })
          .catch((error) => {
            console.error("Map export failed:", error);
            context.sendSystem(clientId, "Map export failed.");
          });
        return;
      }

      context.sendSystem(
        clientId,
        "Usage: /map <place|erase|fill|tag|undo|redo|export> ...",
      );
    },
  };
};

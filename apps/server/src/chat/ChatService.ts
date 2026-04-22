import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ServerToClientMessage } from "@shared/net/protocol.ts";
import {
  CHAT_COMMAND_MANIFEST,
  getChatHelpLines,
  resolveChatCommandAlias,
  type ChatCommandId,
  validateChatCommandManifest,
} from "@shared/chat/commandManifest.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { ProjectileSpawnConfig } from "@server/entities/Projectile.ts";
import type { Effect } from "@server/effects/Effect.ts";
import {
  effectTypeRegistry,
  entityTypeRegistry,
  itemTypeRegistry,
  type EntityTypeEntry,
  type ItemTypeEntry,
} from "@server/registry/registries.ts";
import {
  isBuildingCtor,
  isProjectileCtor,
  isSpawnableEntityCtor,
  isWeaponCtor,
} from "@server/runtime/ctorGuards.ts";

type ChatServiceOptions = {
  networkServer: NetworkServerLike;
  world: World;
  playerIdByClientId: Map<string, number>;
};

type ParsedCommand = {
  command: string;
  args: string[];
};

type FilterResult = {
  text: string;
  flagged: boolean;
};

type ChatCommandHandler = (
  clientId: string,
  player: Player,
  args: string[],
) => void;

function isPlayerCtor(ctor: EntityTypeEntry["ctor"]): ctor is typeof Player {
  return ctor.prototype instanceof Player;
}

/**
 * Server-side chat and command handler with Minecraft-style parsing.
 */
export class ChatService {
  private readonly networkServer: NetworkServerLike;
  private readonly world: World;
  private readonly playerIdByClientId: Map<string, number>;
  private readonly maxMessageLength = 240;
  private readonly placeholderNsfwList = ["badword1", "badword2"];
  private readonly lastWhisperByClientId = new Map<string, string>();
  private readonly maxSpawnAmount = 1000;
  private readonly commandHandlers: Record<ChatCommandId, ChatCommandHandler>;

  constructor({
    networkServer,
    world,
    playerIdByClientId,
  }: ChatServiceOptions) {
    this.networkServer = networkServer;
    this.world = world;
    this.playerIdByClientId = playerIdByClientId;
    this.commandHandlers = {
      help: (clientId) => this.handleHelpCommand(clientId),
      me: (clientId, player, args) =>
        this.handleMeCommand(clientId, player, args),
      say: (clientId, player, args) =>
        this.handleSayCommand(clientId, player, args),
      whisper: (clientId, player, args) =>
        this.handleWhisperCommand(clientId, player, args),
      reply: (clientId, player, args) =>
        this.handleReplyCommand(clientId, player, args),
      list: (clientId) => this.handleListCommand(clientId),
      spawn: (clientId, player, args) =>
        this.handleSpawnCommand(clientId, player, args),
      kill: (clientId, player, args) =>
        this.handleKillCommand(clientId, player, args),
      killall: (clientId) => this.handleKillAllCommand(clientId),
      effect: (clientId, player, args) =>
        this.handleEffectCommand(clientId, player, args),
      give: (clientId, _player, args) => this.handleGiveCommand(clientId, args),
    };

    validateChatCommandManifest();
    this.validateCommandHandlers();
  }

  /**
   * Entry point for player chat text. Routes commands or broadcasts chat.
   */
  public handleChat(clientId: string, rawText: string): void {
    const player = this.getPlayerByClientId(clientId);
    if (!player) {
      return;
    }

    const sanitized = this.sanitizeMessage(rawText);
    if (!sanitized) {
      return;
    }

    if (sanitized.startsWith("/")) {
      this.handleCommand(clientId, player, sanitized);
      return;
    }

    const filtered = this.applyNsfwFilter(sanitized);
    const displayText = `<${player.name}> ${filtered.text}`;
    this.broadcast(displayText, "global", player.name);
  }

  /**
   * Broadcasts a system message to all players.
   * @param text The message text to broadcast
   */
  public broadcastSystemMessage(text: string): void {
    this.broadcast(text, "system");
  }

  private handleCommand(
    clientId: string,
    player: Player,
    commandLine: string,
  ): void {
    const trimmed = commandLine.slice(1).trim();
    if (!trimmed) {
      this.sendSystem(clientId, "Type /help for available commands.");
      return;
    }

    const parsed = this.parseCommand(trimmed);
    if (!parsed) {
      this.sendSystem(
        clientId,
        "Malformed command. Check quotes and try again.",
      );
      return;
    }

    const commandId = resolveChatCommandAlias(parsed.command);
    if (!commandId) {
      this.sendSystem(
        clientId,
        `Unknown command "${parsed.command}". Type /help for help.`,
      );
      return;
    }

    const handler = this.commandHandlers[commandId];
    if (!handler) {
      this.sendSystem(clientId, `Command "${parsed.command}" is unavailable.`);
      return;
    }

    handler(clientId, player, parsed.args);
  }

  private handleHelpCommand(clientId: string): void {
    const lines = ["Commands:", ...getChatHelpLines()];
    this.sendSystem(clientId, lines.join("\n"));
  }

  private validateCommandHandlers(): void {
    for (const command of CHAT_COMMAND_MANIFEST) {
      if (!this.commandHandlers[command.id]) {
        throw new Error(`Missing chat command handler for ${command.id}.`);
      }
    }
  }

  private handleMeCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(clientId, "Usage: /me <action>");
      return;
    }
    const action = this.applyNsfwFilter(args.join(" ")).text;
    this.broadcast(`* ${player.name} ${action}`, "emote", player.name);
  }

  private handleSayCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(clientId, "Usage: /say <message>");
      return;
    }
    const text = this.applyNsfwFilter(args.join(" ")).text;
    this.broadcast(`<${player.name}> ${text}`, "global", player.name);
  }

  private handleWhisperCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length < 2) {
      this.sendSystem(clientId, "Usage: /w <player> <message>");
      return;
    }

    const targetName = args[0] ?? "";
    const message = args.slice(1).join(" ");
    const targetPlayer = this.findPlayerByName(targetName);
    if (!targetPlayer) {
      this.sendSystem(clientId, `No player named "${targetName}" found.`);
      return;
    }

    const targetClientId = this.requireClientId(targetPlayer);
    if (!targetClientId) {
      this.sendSystem(clientId, `Player "${targetPlayer.name}" is offline.`);
      return;
    }
    const filtered = this.applyNsfwFilter(message).text;
    this.sendToClient(
      clientId,
      `[to ${targetPlayer.name}] ${filtered}`,
      "whisper",
      player.name,
    );
    this.sendToClient(
      targetClientId,
      `[from ${player.name}] ${filtered}`,
      "whisper",
      player.name,
    );
    this.lastWhisperByClientId.set(clientId, targetClientId);
    this.lastWhisperByClientId.set(targetClientId, clientId);
  }

  private handleListCommand(clientId: string): void {
    const players = this.world.entities
      .all()
      .filter((entity) => entity instanceof Player) as Player[];
    const names = players.map((player) => player.name);
    this.sendSystem(
      clientId,
      `Online (${names.length}): ${names.join(", ") || "None"}`,
    );
  }

  private handleReplyCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(clientId, "Usage: /r <message>");
      return;
    }

    const lastClientId = this.lastWhisperByClientId.get(clientId);
    if (!lastClientId) {
      this.sendSystem(
        clientId,
        "No recent whispers to reply to. Use /w first.",
      );
      return;
    }

    const targetPlayer = this.getPlayerByClientId(lastClientId);
    if (!targetPlayer) {
      this.sendSystem(clientId, "That player is no longer online.");
      return;
    }

    const targetClientId = this.requireClientId(targetPlayer);
    if (!targetClientId) {
      this.sendSystem(clientId, "That player is no longer online.");
      return;
    }

    const message = this.applyNsfwFilter(args.join(" ")).text;
    this.sendToClient(
      clientId,
      `[to ${targetPlayer.name}] ${message}`,
      "whisper",
      player.name,
    );
    this.sendToClient(
      targetClientId,
      `[from ${player.name}] ${message}`,
      "whisper",
      player.name,
    );
    this.lastWhisperByClientId.set(clientId, targetClientId);
    this.lastWhisperByClientId.set(targetClientId, clientId);
  }

  private handleSpawnCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(
        clientId,
        "Usage: /spawn <entity> [amount] [@a|player|x y z]",
      );
      return;
    }

    const entityToken = args[0] ?? "";
    const resolvedEntry = this.resolveEntityEntry(entityToken);
    if (!resolvedEntry) {
      this.sendSystem(clientId, `Unknown entity "${entityToken}".`);
      return;
    }

    let amount = 1;
    let argIndex = 1;
    if (args[argIndex] && this.isIntegerLike(args[argIndex] ?? "")) {
      amount = Math.max(1, Math.floor(Number(args[argIndex])));
      argIndex += 1;
    }
    if (amount > this.maxSpawnAmount) {
      this.sendSystem(
        clientId,
        `Spawn amount capped at ${this.maxSpawnAmount}.`,
      );
      amount = this.maxSpawnAmount;
    }

    const positionArgs = args.slice(argIndex);
    const spawnTarget = this.resolveSpawnTarget(player, positionArgs);
    if (!spawnTarget) {
      this.sendSystem(
        clientId,
        "Usage: /spawn <entity> [amount] [@a|player|x y z]",
      );
      return;
    }

    const { x: spawnX, y: spawnY } = this.clampToWorldBounds(
      spawnTarget.x,
      spawnTarget.y,
    );

    let spawned = 0;
    for (let i = 0; i < amount; i += 1) {
      try {
        const entity = this.instantiateEntity(resolvedEntry, player, {
          x: spawnX,
          y: spawnY,
        });
        if (!entity) {
          break;
        }
        this.world.spawn(entity);
        spawned += 1;
      } catch (error) {
        console.error(`Failed to spawn ${resolvedEntry.typeId}:`, error);
        this.sendSystem(clientId, `Failed to spawn ${resolvedEntry.typeId}.`);
        break;
      }
    }

    if (spawned > 0) {
      this.sendSystem(clientId, `Spawned ${spawned} ${resolvedEntry.typeId}.`);
    }
  }

  private handleKillCommand(
    clientId: string,
    _player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(clientId, "Usage: /kill @e <entity> | @a | <player>");
      return;
    }

    const targetToken = args[0]?.toLowerCase() ?? "";
    if (targetToken === "@a") {
      const players = this.world.entities
        .all()
        .filter((entity): entity is Player => entity instanceof Player);
      for (const targetPlayer of players) {
        this.killEntity(targetPlayer);
      }
      this.sendSystem(clientId, `Killed ${players.length} player(s).`);
      return;
    }

    if (targetToken === "@e") {
      if (args.length < 2) {
        this.sendSystem(clientId, "Usage: /kill @e <entity>");
        return;
      }
      if (args.length > 2) {
        this.sendSystem(clientId, "Usage: /kill @e <entity>");
        return;
      }

      const entityToken = args[1] ?? "";
      const resolvedEntry = this.resolveEntityEntry(entityToken);
      if (!resolvedEntry) {
        this.sendSystem(clientId, `Unknown entity "${entityToken}".`);
        return;
      }

      let killed = 0;
      for (const entity of this.world.entities.all()) {
        if (entity.typeId !== resolvedEntry.typeId) {
          continue;
        }
        this.killEntity(entity);
        killed += 1;
      }

      if (killed === 0) {
        this.sendSystem(
          clientId,
          `No entities of type ${resolvedEntry.typeId} found.`,
        );
        return;
      }

      this.sendSystem(clientId, `Killed ${killed} ${resolvedEntry.typeId}.`);
      return;
    }

    const targetName = args.join(" ");
    const targetPlayer = this.findPlayerByName(targetName);
    if (!targetPlayer) {
      this.sendSystem(clientId, `No player named "${targetName}" found.`);
      return;
    }
    this.killEntity(targetPlayer);
    this.sendSystem(clientId, `Killed ${targetPlayer.name}.`);
  }

  private handleEffectCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(clientId, "Usage: /effect <effect> [@a|@e|player]");
      return;
    }

    const effectToken = args[0] ?? "";
    const effectEntry = this.resolveEffectEntry(effectToken);
    if (!effectEntry) {
      this.sendSystem(clientId, `Unknown effect "${effectToken}".`);
      return;
    }

    const targetToken = args[1]?.toLowerCase() ?? "@a";
    let targets: Entity[];
    if (targetToken === "@a") {
      targets = this.world.entities
        .all()
        .filter((e): e is Player => e instanceof Player);
    } else if (targetToken === "@e") {
      targets = this.world.entities.all();
    } else {
      const targetPlayer = this.findPlayerByName(args[1] ?? "");
      if (!targetPlayer) {
        this.sendSystem(clientId, `No player named "${args[1] ?? ""}" found.`);
        return;
      }
      targets = [targetPlayer];
    }

    const effect = new effectEntry.ctor();
    for (const target of targets) {
      effect.apply(this.world, player, target);
    }

    this.sendSystem(
      clientId,
      `Applied ${effectEntry.typeId} to ${targets.length} target(s).`,
    );
  }

  private handleGiveCommand(clientId: string, args: string[]): void {
    if (args.length < 2) {
      this.sendSystem(clientId, "Usage: /give <@a|player> <item> [amount]");
      return;
    }

    const targetToken = args[0]?.toLowerCase() ?? "";
    const itemToken = args[1] ?? "";
    const itemEntry = this.resolveItemEntry(itemToken);
    if (!itemEntry) {
      this.sendSystem(clientId, `Unknown item "${itemToken}".`);
      return;
    }

    let amount = 1;
    if (args[2] && this.isIntegerLike(args[2] ?? "")) {
      amount = Math.max(1, Math.floor(Number(args[2])));
    }

    let targets: Player[];
    if (targetToken === "@a") {
      targets = this.world.entities
        .all()
        .filter((entity): entity is Player => entity instanceof Player);
    } else {
      const targetPlayer = this.findPlayerByName(args[0] ?? "");
      if (!targetPlayer) {
        this.sendSystem(clientId, `No player named "${args[0] ?? ""}" found.`);
        return;
      }
      targets = [targetPlayer];
    }

    let grantedCount = 0;
    for (const target of targets) {
      if (!this.giveItemToPlayer(target, itemEntry, amount)) {
        continue;
      }
      grantedCount += 1;
    }

    if (grantedCount === 0) {
      this.sendSystem(
        clientId,
        `Unable to give ${itemEntry.typeId}; every target inventory is full.`,
      );
      return;
    }

    this.sendSystem(
      clientId,
      `Gave ${amount} ${itemEntry.typeId} to ${grantedCount} player(s).`,
    );
  }

  private resolveEffectEntry(effectToken: string): {
    typeId: ResourceId;
    ctor: new () => Effect;
  } | null {
    const normalized = this.normalizeEntityKey(effectToken);
    for (const [typeId, entry] of effectTypeRegistry.entries()) {
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName =
        (entry.ctor as { resourceName?: string }).resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));
      if (candidateKeys.has(normalized)) {
        return entry as { typeId: ResourceId; ctor: new () => Effect };
      }
    }
    return null;
  }

  private resolveItemEntry(itemToken: string): ItemTypeEntry | null {
    const normalized = this.normalizeEntityKey(itemToken);
    for (const [typeId, entry] of itemTypeRegistry.entries()) {
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.ctor.name));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName = entry.ctor.resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));

      if (candidateKeys.has(normalized)) {
        return entry;
      }
    }
    return null;
  }

  private handleKillAllCommand(clientId: string): void {
    const entities = this.world.entities.all();
    let killed = 0;
    for (const entity of entities) {
      this.killEntity(entity);
      killed += 1;
    }

    this.sendSystem(clientId, `Killed ${killed} entities.`);
  }

  private parseCommand(commandLine: string): ParsedCommand | null {
    const tokens = this.tokenizeArguments(commandLine);
    if (!tokens || tokens.length === 0) {
      return null;
    }

    const command = tokens[0];
    if (!command) {
      return null;
    }
    const args = tokens.slice(1);
    return {
      command: command.toLowerCase(),
      args,
    };
  }

  /**
   * Tokenizes command arguments with Minecraft-like quoting rules.
   */
  private tokenizeArguments(input: string): string[] | null {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    let escaping = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index] ?? "";

      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && /\s/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (escaping || inQuotes) {
      return null;
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private resolveEntityEntry(entityToken: string): EntityTypeEntry | null {
    const normalized = this.normalizeEntityKey(entityToken);
    for (const [typeId, entry] of entityTypeRegistry.entries()) {
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.ctor.name));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName = (entry.ctor as typeof Entity).resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));

      if (candidateKeys.has(normalized)) {
        return entry;
      }
    }
    return null;
  }

  private killEntity(entity: Entity): void {
    entity.hp = 0;
    if (entity instanceof Player) {
      entity.handleDeath(this.world);
      return;
    }

    entity.alive = false;
    entity.handleDeath(this.world);
    if (this.world.entities.has(entity.id)) {
      this.world.despawn(entity.id);
    }
  }

  private normalizeEntityKey(value: string): string {
    return value.replace(/\s+/g, "").replace(/_/g, "").toLowerCase();
  }

  private giveItemToPlayer(
    target: Player,
    itemEntry: ItemTypeEntry,
    amount: number,
  ): boolean {
    if (isWeaponCtor(itemEntry.ctor)) {
      if (!target.inventory.canAddWeaponCount(amount)) {
        return false;
      }
      for (let index = 0; index < amount; index += 1) {
        target.inventory.addWeapon(new itemEntry.ctor());
      }
      return true;
    }

    if (!target.inventory.canAddStackable(itemEntry.typeId, amount)) {
      return false;
    }
    return target.inventory.addStackable(itemEntry.typeId, amount);
  }

  private resolveSpawnTarget(
    player: Player,
    args: string[],
  ): { x: number; y: number } | null {
    if (args.length === 0) {
      return { x: player.x, y: player.y };
    }

    if (args.length === 1) {
      const token = args[0] ?? "";
      if (token.toLowerCase() === "@a") {
        return { x: player.x, y: player.y };
      }

      const targetPlayer = this.findPlayerByName(token);
      if (!targetPlayer) {
        return null;
      }
      return { x: targetPlayer.x, y: targetPlayer.y };
    }

    if (args.length >= 3) {
      const parsedX = this.parseCoordinate(args[0] ?? "", player.x);
      const parsedY = this.parseCoordinate(args[1] ?? "", player.y);
      const parsedZ = this.parseCoordinate(args[2] ?? "", 0);
      if (
        parsedX === null ||
        parsedY === null ||
        parsedZ === null ||
        args.length > 3
      ) {
        return null;
      }
      return { x: parsedX, y: parsedY };
    }

    return null;
  }

  private parseCoordinate(token: string, base: number): number | null {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("~")) {
      if (trimmed === "~") {
        return base;
      }
      const offset = Number(trimmed.slice(1));
      if (!Number.isFinite(offset)) {
        return null;
      }
      return base + offset;
    }
    const absolute = Number(trimmed);
    if (!Number.isFinite(absolute)) {
      return null;
    }
    return absolute;
  }

  private clampToWorldBounds(x: number, y: number): { x: number; y: number } {
    const clampedX = Math.max(
      0,
      Math.min(this.world.gameConfig.worldSize.w, x),
    );
    const clampedY = Math.max(
      0,
      Math.min(this.world.gameConfig.worldSize.h, y),
    );
    return { x: clampedX, y: clampedY };
  }

  private instantiateEntity(
    entry: EntityTypeEntry,
    player: Player,
    position: { x: number; y: number },
  ): Entity | null {
    const entityId = this.world.allocEntityId();
    const ctor = entry.ctor;

    if (entry.kind === "projectile") {
      if (!isProjectileCtor(ctor)) {
        return null;
      }
      const config: ProjectileSpawnConfig = {
        ownerId: player.id,
        x: position.x,
        y: position.y,
        directionX: 1,
        directionY: 0,
        rotation: 0,
      };
      return new ctor(entityId, config);
    }

    if (entry.kind === "building" && isBuildingCtor(ctor)) {
      const building = new ctor(entityId, entry.content.label, 1, player.id);
      building.x = position.x;
      building.y = position.y;
      return building;
    }

    if (entry.kind === "player" && isPlayerCtor(ctor)) {
      const spawnedPlayer = new ctor(entityId, `spawned-${entityId}`);
      spawnedPlayer.x = position.x;
      spawnedPlayer.y = position.y;
      return spawnedPlayer;
    }

    if (!isSpawnableEntityCtor(ctor)) {
      return null;
    }

    const entity = new ctor(entityId);
    entity.x = position.x;
    entity.y = position.y;
    return entity;
  }

  private isIntegerLike(value: string): boolean {
    return /^-?\d+$/.test(value.trim());
  }

  private sanitizeMessage(rawText: string): string {
    const cleaned = rawText.replace(/[\x00-\x1F\x7F]/g, "").trim();
    return cleaned.slice(0, this.maxMessageLength);
  }

  /**
   * Placeholder NSFW filter. Swap this with a real moderation service.
   */
  private applyNsfwFilter(text: string): FilterResult {
    let filtered = text;
    for (const term of this.placeholderNsfwList) {
      const matcher = new RegExp(`\\b${term}\\b`, "gi");
      filtered = filtered.replace(matcher, "****");
    }
    return {
      text: filtered,
      flagged: filtered !== text,
    };
  }

  private broadcast(
    text: string,
    kind: "global" | "system" | "emote" | "whisper",
    from?: string,
  ): void {
    const message: ServerToClientMessage = {
      t: "chat",
      text,
      kind,
      from,
    };
    this.networkServer.broadcast(JSON.stringify(message));
  }

  private sendSystem(clientId: string, text: string): void {
    this.sendToClient(clientId, text, "system");
  }

  private sendToClient(
    clientId: string,
    text: string,
    kind: "global" | "system" | "emote" | "whisper",
    from?: string,
  ): void {
    const message: ServerToClientMessage = {
      t: "chat",
      text,
      kind,
      from,
    };
    this.networkServer.send(clientId, JSON.stringify(message));
  }

  private getPlayerByClientId(clientId: string): Player | undefined {
    const playerId = this.playerIdByClientId.get(clientId);
    if (!playerId) {
      return undefined;
    }
    const player = this.world.get<Player>(playerId);
    if (!player) {
      return undefined;
    }
    return player;
  }

  private findPlayerByName(name: string): Player | undefined {
    const lowered = name.toLowerCase();
    for (const entity of this.world.entities.all()) {
      if (entity instanceof Player && entity.name.toLowerCase() === lowered) {
        return entity;
      }
    }
    return undefined;
  }

  private requireClientId(player: Player): string {
    for (const [clientId, playerId] of this.playerIdByClientId.entries()) {
      if (playerId === player.id) {
        return clientId;
      }
    }
    return "";
  }
}

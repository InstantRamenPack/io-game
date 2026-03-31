import type {WsServer} from "@server/net/WsServer.ts";
import type {World} from "@server/world/World.ts";
import type {ResourceId} from "@shared/ids/ResourceId.ts";
import type {ServerToClientMessage} from "@shared/net/protocol.ts";
import type {Entity} from "@server/entities/Entity.ts";
import {Player} from "@server/entities/Player.ts";
import {Building} from "@server/entities/Building.ts";
import type {ProjectileSpawnConfig} from "@server/entities/Projectile.ts";
import {entityTypeRegistry} from "@server/registry/registries.ts";

type ChatServiceOptions = {
  networkServer: WsServer;
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

/**
 * Server-side chat and command handler with Minecraft-style parsing.
 */
export class ChatService {
  private readonly networkServer: WsServer;
  private readonly world: World;
  private readonly playerIdByClientId: Map<string, number>;
  private readonly maxMessageLength = 240;
  private readonly placeholderNsfwList = ["badword1", "badword2"];
  private readonly lastWhisperByClientId = new Map<string, string>();
  private readonly maxSpawnAmount = 1000;

  constructor({ networkServer, world, playerIdByClientId }: ChatServiceOptions) {
    this.networkServer = networkServer;
    this.world = world;
    this.playerIdByClientId = playerIdByClientId;
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

    switch (parsed.command) {
      case "help":
        this.handleHelpCommand(clientId);
        return;
      case "me":
        this.handleMeCommand(clientId, player, parsed.args);
        return;
      case "say":
        this.handleSayCommand(clientId, player, parsed.args);
        return;
      case "w":
      case "whisper":
      case "tell":
        this.handleWhisperCommand(clientId, player, parsed.args);
        return;
      case "list":
        this.handleListCommand(clientId);
        return;
      case "r":
        this.handleReplyCommand(clientId, player, parsed.args);
        return;
      case "spawn":
        this.handleSpawnCommand(clientId, player, parsed.args);
        return;
      case "kill":
        this.handleKillCommand(clientId, player, parsed.args);
        return;
      case "killall":
        this.handleKillAllCommand(clientId);
        return;
      default:
        this.sendSystem(
          clientId,
          `Unknown command "${parsed.command}". Type /help for help.`,
        );
    }
  }

  private handleHelpCommand(clientId: string): void {
    const lines = [
      "Commands:",
      "/help - show this help",
      "/me <action> - emote text",
      "/say <message> - chat message",
      "/w <player> <message> - whisper",
      "/r <message> - reply to last whisper",
      "/list - list online players",
      "/spawn <entity> [amount] [@a|player|x y z] - spawn entities",
      "/kill @e <entity> | @a | <player> - kill entities or players",
      "/killall - kill every entity",
    ];
    this.sendSystem(clientId, lines.join("\n"));
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
      const entity = this.instantiateEntity(resolvedEntry, player, {
        x: spawnX,
        y: spawnY,
      });
      if (!entity) {
        this.sendSystem(
          clientId,
          `Failed to spawn ${resolvedEntry.typeId}.`,
        );
        break;
      }
      this.world.spawn(entity);
      spawned += 1;
    }

    if (spawned > 0) {
      this.sendSystem(
        clientId,
        `Spawned ${spawned} ${resolvedEntry.typeId}.`,
      );
    }
  }

  private handleKillCommand(
    clientId: string,
    player: Player,
    args: string[],
  ): void {
    if (args.length === 0) {
      this.sendSystem(
        clientId,
        "Usage: /kill @e <entity> | @a | <player>",
      );
      return;
    }

    const targetToken = args[0]?.toLowerCase() ?? "";
    if (targetToken === "@a") {
      this.killEntity(player);
      this.sendSystem(clientId, "You died.");
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

      this.sendSystem(
        clientId,
        `Killed ${killed} ${resolvedEntry.typeId}.`,
      );
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

    const [command, ...args] = tokens;
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

  private resolveEntityEntry(entityToken: string): {
    typeId: ResourceId;
    kind: string;
    content: { label: string };
    ctor: new (...args: never[]) => Entity;
  } | null {
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
        return entry as {
          typeId: ResourceId;
          kind: string;
          content: { label: string };
          ctor: new (...args: never[]) => Entity;
        };
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
    const clampedX = Math.max(0, Math.min(this.world.gameConfig.worldSize.w, x));
    const clampedY = Math.max(0, Math.min(this.world.gameConfig.worldSize.h, y));
    return { x: clampedX, y: clampedY };
  }

  private instantiateEntity(
    entry: {
      typeId: ResourceId;
      kind: string;
      content: { label: string };
      ctor: new (...args: never[]) => Entity;
    },
    player: Player,
    position: { x: number; y: number },
  ): Entity | null {
    const entityId = this.world.allocEntityId();
    const ctor = entry.ctor;

    try {
      if (entry.kind === "projectile") {
        const config: ProjectileSpawnConfig = {
          ownerId: player.id,
          x: position.x,
          y: position.y,
          directionX: 1,
          directionY: 0,
          rotation: 0,
        };
        return new (ctor as unknown as new (
            id: number,
            config: ProjectileSpawnConfig,
        ) => Entity)(entityId, config);
      }

      if (entry.kind === "building" && ctor.prototype instanceof Building) {
        const building = new (ctor as unknown as new (
          id: number,
          label: string,
          tier: number,
          ownerId?: number,
        ) => Entity)(entityId, entry.content.label, 1, player.id);
        building.x = position.x;
        building.y = position.y;
        return building;
      }

      if (entry.kind === "player" && ctor.prototype instanceof Player) {
        const spawnedPlayer = new (ctor as unknown as new (
          id: number,
          name?: string,
        ) => Entity)(entityId, `spawned-${entityId}`);
        spawnedPlayer.x = position.x;
        spawnedPlayer.y = position.y;
        return spawnedPlayer;
      }

      const entity = new ctor(entityId);
      entity.x = position.x;
      entity.y = position.y;
      return entity;
    } catch {
      return null;
    }
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

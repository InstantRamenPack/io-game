import {
  CHAT_COMMAND_SCHEMAS,
  resolveChatCommandAlias,
  type ChatCommandId,
  validateChatCommandSchema,
} from "@shared/chat/commandSchema.ts";
import { parseChatCommand } from "@shared/chat/commandParser.ts";
import { ChatContext } from "@server/chat/ChatContext.ts";
import { createAdminCommandHandlers } from "@server/chat/commands/adminCommands.ts";
import { createSocialCommandHandlers } from "@server/chat/commands/socialCommands.ts";
import type { ChatCommandHandler } from "@server/chat/commands/types.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import type { World } from "@server/world/World.ts";

type ChatServiceOptions = {
  networkServer: NetworkServerLike;
  world: World;
  playerIdByClientId: Map<string, number>;
};

type FilterResult = {
  text: string;
  flagged: boolean;
};

/**
 * Server-side chat entrypoint. Sanitization stays here; command execution lives in the router.
 */
export class ChatService {
  private readonly maxMessageLength = 240;
  private readonly blockedTerms: readonly string[];
  private readonly context: ChatContext;
  private readonly commandHandlers: Record<ChatCommandId, ChatCommandHandler>;

  constructor({
    networkServer,
    world,
    playerIdByClientId,
  }: ChatServiceOptions) {
    this.blockedTerms = parseBlockedTermsFromEnv();
    this.context = new ChatContext({
      networkServer,
      world,
      playerIdByClientId,
      filterText: (text) => this.applyNsfwFilter(text),
    });
    this.commandHandlers = {
      ...createSocialCommandHandlers(this.context),
      ...createAdminCommandHandlers(this.context),
    } as Record<ChatCommandId, ChatCommandHandler>;
    validateChatCommandSchema();
    for (const command of CHAT_COMMAND_SCHEMAS) {
      if (!this.commandHandlers[command.id]) {
        throw new Error(`Missing chat command handler for ${command.id}.`);
      }
    }
  }

  /**
   * Entry point for player chat text. Routes commands or broadcasts chat.
   */
  public handleChat(clientId: string, rawText: string): void {
    const player = this.context.getPlayerByClientId(clientId);
    if (!player) {
      return;
    }

    const sanitized = this.sanitizeMessage(rawText);
    if (!sanitized) {
      return;
    }

    if (sanitized.startsWith("/")) {
      this.routeCommand(clientId, player, sanitized);
      return;
    }

    const filtered = this.applyNsfwFilter(sanitized);
    this.context.broadcast(
      `<${player.name}> ${filtered.text}`,
      "global",
      player.name,
    );
  }

  /**
   * Broadcasts a system message to all players.
   */
  public broadcastSystemMessage(text: string): void {
    this.context.broadcast(text, "system");
  }

  private routeCommand(
    clientId: string,
    player: Parameters<ChatCommandHandler>[1],
    commandLine: string,
  ): void {
    const trimmed = commandLine.slice(1).trim();
    if (!trimmed) {
      this.context.sendSystem(clientId, "Type /help for available commands.");
      return;
    }
    const parsed = parseChatCommand(trimmed);
    if (!parsed) {
      this.context.sendSystem(
        clientId,
        "Malformed command. Check quotes and try again.",
      );
      return;
    }
    const commandId = resolveChatCommandAlias(parsed.command);
    if (!commandId) {
      this.context.sendSystem(
        clientId,
        `Unknown command "${parsed.command}". Type /help for help.`,
      );
      return;
    }
    this.commandHandlers[commandId](clientId, player, parsed.args);
  }

  private sanitizeMessage(rawText: string): string {
    const cleaned = rawText.replace(/[\x00-\x1F\x7F]/g, "").trim();
    return cleaned.slice(0, this.maxMessageLength);
  }

  private applyNsfwFilter(text: string): FilterResult {
    if (this.blockedTerms.length === 0) {
      return { text, flagged: false };
    }

    let filtered = text;
    for (const term of this.blockedTerms) {
      const matcher = new RegExp(`\\b${term}\\b`, "gi");
      filtered = filtered.replace(matcher, "****");
    }
    return {
      text: filtered,
      flagged: filtered !== text,
    };
  }
}

/**
 * CHAT_FILTER_TERMS accepts a comma-separated list of exact blocked terms.
 * Empty or missing config keeps chat unmodified.
 */
function parseBlockedTermsFromEnv(): readonly string[] {
  const configured = process.env.CHAT_FILTER_TERMS;
  if (!configured) {
    return [];
  }

  return configured
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

import {
  CHAT_COMMAND_SCHEMAS,
  resolveChatCommandAlias,
  type ChatCommandId,
  validateChatCommandSchema,
} from "@shared/chat/commandSchema.ts";
import { parseChatCommand } from "@shared/chat/commandParser.ts";
import type { ChatContext } from "@server/chat/ChatContext.ts";
import type { Player } from "@server/entities/Player.ts";
import { createAdminCommandHandlers } from "@server/chat/commands/adminCommands.ts";
import { createSocialCommandHandlers } from "@server/chat/commands/socialCommands.ts";
import type { ChatCommandHandler } from "@server/chat/commands/types.ts";

/**
 * Parses, validates, and dispatches server chat commands.
 */
export class ChatCommandRouter {
  private readonly context: ChatContext;
  private readonly commandHandlers: Record<ChatCommandId, ChatCommandHandler>;

  constructor(context: ChatContext) {
    this.context = context;
    this.commandHandlers = {
      ...createSocialCommandHandlers(context),
      ...createAdminCommandHandlers(context),
    } as Record<ChatCommandId, ChatCommandHandler>;

    validateChatCommandSchema();
    this.validateCommandHandlers();
  }

  public route(clientId: string, player: Player, commandLine: string): void {
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

    this.commandHandlers[commandId]?.(clientId, player, parsed.args);
  }

  private validateCommandHandlers(): void {
    for (const command of CHAT_COMMAND_SCHEMAS) {
      if (!this.commandHandlers[command.id]) {
        throw new Error(`Missing chat command handler for ${command.id}.`);
      }
    }
  }
}

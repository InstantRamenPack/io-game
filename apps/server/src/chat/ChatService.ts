import { ChatCommandRouter } from "@server/chat/ChatCommandRouter.ts";
import { ChatContext } from "@server/chat/ChatContext.ts";
import type { WsServer } from "@server/net/WsServer.ts";
import type { World } from "@server/world/World.ts";

type ChatServiceOptions = {
  networkServer: WsServer;
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
  private readonly placeholderNsfwList = ["badword1", "badword2"];
  private readonly context: ChatContext;
  private readonly commandRouter: ChatCommandRouter;

  constructor({
    networkServer,
    world,
    playerIdByClientId,
  }: ChatServiceOptions) {
    this.context = new ChatContext({
      networkServer,
      world,
      playerIdByClientId,
      filterText: (text) => this.applyNsfwFilter(text),
    });
    this.commandRouter = new ChatCommandRouter(this.context);
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
      this.commandRouter.route(clientId, player, sanitized);
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
}

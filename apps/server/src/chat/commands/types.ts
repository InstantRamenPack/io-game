import type { ChatCommandId } from "@shared/chat/commandSchema.ts";
import type { Player } from "@server/entities/Player.ts";
import type { ChatContext } from "@server/chat/ChatContext.ts";

export type ChatCommandHandler = (
  clientId: string,
  player: Player,
  args: string[],
) => void;

export type ChatCommandHandlerFactory = (
  context: ChatContext,
) => Partial<Record<ChatCommandId, ChatCommandHandler>>;

import { getChatHelpLines } from "@shared/chat/commandSchema.ts";
import type { ChatCommandHandlerFactory } from "@server/chat/commands/types.ts";

export const createSocialCommandHandlers: ChatCommandHandlerFactory = (
  context,
) => ({
  help: (clientId) => {
    context.sendSystem(
      clientId,
      ["Commands:", ...getChatHelpLines()].join("\n"),
    );
  },
  me: (clientId, player, args) => {
    if (args.length === 0) {
      context.sendSystem(clientId, "Usage: /me <action>");
      return;
    }
    const action = context.filterText(args.join(" ")).text;
    context.broadcast(`* ${player.name} ${action}`, "emote", player.name);
  },
  say: (clientId, player, args) => {
    if (args.length === 0) {
      context.sendSystem(clientId, "Usage: /say <message>");
      return;
    }
    const text = context.filterText(args.join(" ")).text;
    context.broadcast(`<${player.name}> ${text}`, "global", player.name);
  },
  whisper: (clientId, player, args) => {
    if (args.length < 2) {
      context.sendSystem(clientId, "Usage: /w <player> <message>");
      return;
    }

    const targetName = args[0] ?? "";
    const message = args.slice(1).join(" ");
    const targetPlayer = context.findPlayerByName(targetName);
    if (!targetPlayer) {
      context.sendSystem(clientId, `No player named "${targetName}" found.`);
      return;
    }

    const targetClientId = context.requireClientId(targetPlayer);
    if (!targetClientId) {
      context.sendSystem(clientId, `Player "${targetPlayer.name}" is offline.`);
      return;
    }

    const filtered = context.filterText(message).text;
    context.sendToClient(
      clientId,
      `[to ${targetPlayer.name}] ${filtered}`,
      "whisper",
      player.name,
    );
    context.sendToClient(
      targetClientId,
      `[from ${player.name}] ${filtered}`,
      "whisper",
      player.name,
    );
    context.rememberWhisperPair(clientId, targetClientId);
  },
  reply: (clientId, player, args) => {
    if (args.length === 0) {
      context.sendSystem(clientId, "Usage: /r <message>");
      return;
    }

    const lastClientId = context.getLastWhisperClientId(clientId);
    if (!lastClientId) {
      context.sendSystem(
        clientId,
        "No recent whispers to reply to. Use /w first.",
      );
      return;
    }

    const targetPlayer = context.getPlayerByClientId(lastClientId);
    if (!targetPlayer) {
      context.sendSystem(clientId, "That player is no longer online.");
      return;
    }

    const targetClientId = context.requireClientId(targetPlayer);
    if (!targetClientId) {
      context.sendSystem(clientId, "That player is no longer online.");
      return;
    }

    const message = context.filterText(args.join(" ")).text;
    context.sendToClient(
      clientId,
      `[to ${targetPlayer.name}] ${message}`,
      "whisper",
      player.name,
    );
    context.sendToClient(
      targetClientId,
      `[from ${player.name}] ${message}`,
      "whisper",
      player.name,
    );
    context.rememberWhisperPair(clientId, targetClientId);
  },
  list: (clientId) => {
    const names = context.getOnlinePlayers().map((player) => player.name);
    context.sendSystem(
      clientId,
      `Online (${names.length}): ${names.join(", ") || "None"}`,
    );
  },
});

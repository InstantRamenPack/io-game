export type ChatCommandId =
  | "help"
  | "me"
  | "say"
  | "whisper"
  | "reply"
  | "list"
  | "spawn"
  | "kill"
  | "killall"
  | "effect"
  | "give"
  | "time";

export type ChatAutocompleteSource =
  | "command"
  | "entity"
  | "item"
  | "effect"
  | "selector"
  | "player"
  | "time_action"
  | "time_period";

export type ChatAutocompleteRule = {
  argIndex: number;
  sources: readonly ChatAutocompleteSource[];
  whenArgEquals?: {
    index: number;
    value: string;
  };
};

export type ChatCommandSchemaEntry = {
  id: ChatCommandId;
  primaryAlias: string;
  aliases: readonly string[];
  usage: string;
  summary: string;
  autocomplete?: readonly ChatAutocompleteRule[];
};

export const CHAT_COMMAND_SCHEMAS = [
  {
    id: "help",
    primaryAlias: "help",
    aliases: ["help"],
    usage: "/help",
    summary: "show this help",
  },
  {
    id: "me",
    primaryAlias: "me",
    aliases: ["me"],
    usage: "/me <action>",
    summary: "emote text",
  },
  {
    id: "say",
    primaryAlias: "say",
    aliases: ["say"],
    usage: "/say <message>",
    summary: "chat message",
  },
  {
    id: "whisper",
    primaryAlias: "w",
    aliases: ["w", "whisper", "tell"],
    usage: "/w <player> <message>",
    summary: "whisper",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["player"],
      },
    ],
  },
  {
    id: "reply",
    primaryAlias: "r",
    aliases: ["r"],
    usage: "/r <message>",
    summary: "reply to last whisper",
  },
  {
    id: "list",
    primaryAlias: "list",
    aliases: ["list"],
    usage: "/list",
    summary: "list online players",
  },
  {
    id: "spawn",
    primaryAlias: "spawn",
    aliases: ["spawn"],
    usage: "/spawn <entity> [amount] [@a|player|x y z]",
    summary: "spawn entities",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["entity"],
      },
      {
        argIndex: 2,
        sources: ["selector", "player"],
      },
    ],
  },
  {
    id: "kill",
    primaryAlias: "kill",
    aliases: ["kill"],
    usage: "/kill @e <entity> | @a | <player>",
    summary: "kill entities or players",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["selector", "player"],
      },
      {
        argIndex: 1,
        sources: ["entity"],
        whenArgEquals: {
          index: 0,
          value: "@e",
        },
      },
    ],
  },
  {
    id: "killall",
    primaryAlias: "killall",
    aliases: ["killall"],
    usage: "/killall",
    summary: "kill every entity",
  },
  {
    id: "effect",
    primaryAlias: "effect",
    aliases: ["effect"],
    usage: "/effect <effect> [@a|@e|player]",
    summary: "apply an effect",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["effect"],
      },
      {
        argIndex: 1,
        sources: ["selector", "player"],
      },
    ],
  },
  {
    id: "give",
    primaryAlias: "give",
    aliases: ["give"],
    usage: "/give <@a|player> <item> [amount]",
    summary: "grant an item",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["selector", "player"],
      },
      {
        argIndex: 1,
        sources: ["item"],
      },
    ],
  },
  {
    id: "time",
    primaryAlias: "time",
    aliases: ["time"],
    usage: "/time <set day|night>",
    summary: "set day or night",
    autocomplete: [
      {
        argIndex: 0,
        sources: ["time_action"],
      },
      {
        argIndex: 1,
        sources: ["time_period"],
        whenArgEquals: {
          index: 0,
          value: "set",
        },
      },
    ],
  },
] as const satisfies readonly ChatCommandSchemaEntry[];

const commandAliasToId = new Map<string, ChatCommandId>();
const commandById = new Map<ChatCommandId, ChatCommandSchemaEntry>();

for (const command of CHAT_COMMAND_SCHEMAS) {
  commandById.set(command.id, command);
  for (const alias of command.aliases) {
    commandAliasToId.set(alias.toLowerCase(), command.id);
  }
}

export function getChatCommandSchemaById(
  commandId: ChatCommandId,
): ChatCommandSchemaEntry {
  const command = commandById.get(commandId);
  if (!command) {
    throw new Error(`Unknown chat command id: ${commandId}`);
  }
  return command;
}

export function resolveChatCommandAlias(
  alias: string,
): ChatCommandId | undefined {
  return commandAliasToId.get(alias.toLowerCase());
}

export function getChatHelpLines(): string[] {
  return CHAT_COMMAND_SCHEMAS.map(
    (command) => `${command.usage} - ${command.summary}`,
  );
}

export function validateChatCommandSchema(): void {
  const seenIds = new Set<ChatCommandId>();
  const seenAliases = new Set<string>();

  for (const command of CHAT_COMMAND_SCHEMAS) {
    if (seenIds.has(command.id)) {
      throw new Error(`Duplicate chat command id: ${command.id}`);
    }
    seenIds.add(command.id);

    for (const alias of command.aliases) {
      const normalizedAlias = alias.trim().toLowerCase();
      if (!normalizedAlias) {
        throw new Error(`Chat command ${command.id} has an empty alias.`);
      }
      if (seenAliases.has(normalizedAlias)) {
        throw new Error(`Duplicate chat command alias: ${normalizedAlias}`);
      }
      seenAliases.add(normalizedAlias);
    }
  }
}

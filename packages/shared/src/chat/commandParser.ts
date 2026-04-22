export type ParsedChatCommand = {
  command: string;
  args: string[];
};

export function tokenizeChatCommandArguments(input: string): string[] | null {
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

export function parseChatCommand(input: string): ParsedChatCommand | null {
  const tokens = tokenizeChatCommandArguments(input);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const command = tokens[0]?.toLowerCase();
  if (!command) {
    return null;
  }

  return {
    command,
    args: tokens.slice(1),
  };
}

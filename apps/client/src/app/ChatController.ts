import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { ChatMessage } from "@shared/net/protocol.ts";

export type ChatController = {
  setVisible: (visible: boolean) => void;
};

type ChatControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  hudController: HudController;
};

type ChatLine = {
  element: HTMLDivElement;
  createdAt: number;
  fadeTimeout?: number;
  removeTimeout?: number;
};

const MAX_LINES = 8;
const FADE_AFTER_MS = 8000;
const REMOVE_AFTER_MS = 12000;

export function createChatController({
  elements,
  gameClient,
  hudController,
}: ChatControllerOptions): ChatController {
  const root = elements.chatRoot;
  const linesEl = elements.chatLines;
  const input = elements.chatInput;

  if (!root || !linesEl || !input) {
    return {
      setVisible: () => undefined,
    };
  }

  let isOpen = false;
  const lines: ChatLine[] = [];
  const history: string[] = [];
  let historyIndex = 0;
  let historyDraft = "";

  const setVisible = (visible: boolean): void => {
    root.hidden = !visible;
    if (!visible) {
      closeChat();
    }
  };

  const openChat = (): void => {
    if (isOpen) {
      return;
    }
    isOpen = true;
    root.classList.add("is-open");
    input.value = "";
    historyIndex = history.length;
    historyDraft = "";
    input.focus();
    for (const line of lines) {
      clearLineTimers(line);
      line.element.classList.remove("is-faded");
    }
  };

  const closeChat = (): void => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    root.classList.remove("is-open");
    input.blur();
    scheduleAllLines();
  };

  const scheduleAllLines = (): void => {
    const now = Date.now();
    for (const line of lines) {
      scheduleLine(line, now);
    }
  };

  const clearLineTimers = (line: ChatLine): void => {
    if (line.fadeTimeout) {
      window.clearTimeout(line.fadeTimeout);
      line.fadeTimeout = undefined;
    }
    if (line.removeTimeout) {
      window.clearTimeout(line.removeTimeout);
      line.removeTimeout = undefined;
    }
  };

  const scheduleLine = (line: ChatLine, now = Date.now()): void => {
    clearLineTimers(line);

    if (isOpen) {
      line.element.classList.remove("is-faded");
      return;
    }

    const age = now - line.createdAt;
    const fadeDelay = Math.max(0, FADE_AFTER_MS - age);
    const removeDelay = Math.max(0, REMOVE_AFTER_MS - age);

    if (fadeDelay === 0) {
      line.element.classList.add("is-faded");
    } else {
      line.fadeTimeout = window.setTimeout(() => {
        line.element.classList.add("is-faded");
      }, fadeDelay);
    }

    if (removeDelay === 0) {
      removeLine(line);
    } else {
      line.removeTimeout = window.setTimeout(() => {
        removeLine(line);
      }, removeDelay);
    }
  };

  const removeLine = (line: ChatLine): void => {
    clearLineTimers(line);
    const index = lines.indexOf(line);
    if (index >= 0) {
      lines.splice(index, 1);
    }
    line.element.remove();
  };

  const pushLine = (message: ChatMessage): void => {
    const lineEl = document.createElement("div");
    lineEl.className = "chat-line";
    if (message.kind) {
      lineEl.classList.add(`chat-${message.kind}`);
    }
    lineEl.textContent = message.text;

    linesEl.appendChild(lineEl);
    const line: ChatLine = {
      element: lineEl,
      createdAt: Date.now(),
    };
    lines.push(line);

    while (lines.length > MAX_LINES) {
      removeLine(lines[0]);
    }

    scheduleLine(line);
  };

  const shouldBlockEnterForMenus = (): boolean => {
    return hudController.isBuildMenuOpen() || hudController.isCraftingMenuOpen();
  };

  const isGameActive = (): boolean => {
    return (
      gameClient.isSessionReady() &&
      elements.menuRoot?.style.display === "none"
    );
  };

  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    const key = event.key.toLowerCase();

    if (isOpen) {
      if (key === "enter") {
        event.preventDefault();
        event.stopPropagation();
        const text = input.value.trim();
        if (text.length > 0) {
          gameClient.networkClient.sendChat(text);
          history.push(text);
          historyIndex = history.length;
          historyDraft = "";
        }
        closeChat();
      } else if (key === "escape") {
        event.preventDefault();
        event.stopPropagation();
        closeChat();
      }
      return;
    }

    if (!isGameActive()) {
      return;
    }

    if (key === "enter") {
      if (shouldBlockEnterForMenus()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openChat();
      return;
    }

    if (key === "/") {
      event.preventDefault();
      event.stopPropagation();
      openChat();
      input.value = "/";
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (key === "t") {
      event.preventDefault();
      event.stopPropagation();
      openChat();
    }
  });

  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      event.preventDefault();
      closeChat();
      return;
    }

    if (keyboardEvent.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      if (historyIndex === history.length) {
        historyDraft = input.value;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? "";
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (keyboardEvent.key === "ArrowDown") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      historyIndex = Math.min(history.length, historyIndex + 1);
      if (historyIndex === history.length) {
        input.value = historyDraft;
      } else {
        input.value = history[historyIndex] ?? "";
      }
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  gameClient.networkClient.onChat((message) => {
    pushLine(message);
  });

  return {
    setVisible,
  };
}

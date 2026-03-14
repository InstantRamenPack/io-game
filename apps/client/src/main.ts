import { GameClient } from "@client/client/GameClient.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";

const styleText = `
:root {
  --bg-0: #0d160f;
  --bg-1: #112116;
  --bg-2: #1d3623;
  --panel: rgba(7, 14, 9, 0.78);
  --panel-strong: rgba(5, 10, 7, 0.9);
  --line: rgba(175, 255, 144, 0.16);
  --text-main: #e8f5e7;
  --text-dim: #98ad96;
  --accent: #5cca2a;
  --accent-strong: #82ec4f;
  --hazard: #bf382f;
  --hazard-soft: rgba(191, 56, 47, 0.24);
  --shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  font-family: "Trebuchet MS", "Segoe UI", sans-serif;
  color: var(--text-main);
  background: radial-gradient(circle at 18% 20%, #1d311f 0%, #0d140f 58%, #070a08 100%);
}

#game-root {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: #d7f3d2;
}

.menu-scene {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 24px;
}

.menu-scene::before {
  content: "";
  position: absolute;
  inset: -20%;
  background:
    linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 48px 48px,
    linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 48px 48px;
  transform: perspective(900px) rotateX(64deg) translateY(24vh);
  transform-origin: center;
  opacity: 0.45;
  animation: drift 8s linear infinite;
}

.menu-scene::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.7) 100%),
    linear-gradient(92deg, rgba(130, 236, 79, 0.03) 0%, rgba(191, 56, 47, 0.22) 85%);
  pointer-events: none;
}

.hud-top {
  position: absolute;
  top: 18px;
  left: 24px;
  right: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  z-index: 3;
}

.brand {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.brand h1 {
  margin: 0;
  font-size: clamp(38px, 6vw, 82px);
  line-height: 0.88;
}

.brand p {
  margin: 8px 0 0;
  color: var(--text-dim);
  font-size: clamp(13px, 1.8vw, 20px);
}

.status {
  font-size: 13px;
  color: var(--text-dim);
  text-align: right;
  max-width: 240px;
}

.layout {
  width: min(1080px, 100%);
  display: grid;
  gap: 14px;
  grid-template-columns: 230px 1fr;
  align-items: end;
  position: relative;
  z-index: 3;
  margin-top: 90px;
}

.side-menu {
  background: linear-gradient(180deg, rgba(13, 30, 16, 0.68), rgba(7, 15, 9, 0.7));
  border: 1px solid rgba(157, 236, 123, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(6px);
}

.side-menu button {
  width: 100%;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: transparent;
  color: var(--text-main);
  text-align: left;
  padding: 15px 18px;
  font-size: 27px;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
}

.side-menu button:hover,
.side-menu button[aria-current="true"] {
  background: linear-gradient(90deg, rgba(118, 230, 61, 0.23), transparent);
  color: #f4ffe9;
}

.play-card {
  background: linear-gradient(180deg, var(--panel), var(--panel-strong));
  border: 1px solid rgba(168, 248, 135, 0.2);
  box-shadow: var(--shadow);
  border-radius: 14px;
  padding: 28px;
}

.card-top {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
}

.card-top h2 {
  margin: 0;
  font-size: clamp(24px, 3.2vw, 44px);
  letter-spacing: 0.04em;
}

.danger-pill {
  border: 1px solid rgba(255, 92, 84, 0.45);
  background: var(--hazard-soft);
  color: #ffd4d0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 10px;
}

.metrics {
  display: flex;
  gap: 18px;
  color: var(--text-dim);
  font-size: 13px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.account-gate {
  margin-bottom: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(255, 140, 140, 0.22);
  background: rgba(191, 56, 47, 0.15);
  color: #ffd7d3;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
}

.account-gate.ok {
  border-color: rgba(157, 236, 123, 0.24);
  background: rgba(72, 170, 35, 0.16);
  color: #d8f7ca;
}

.account-btn {
  border: 0;
  border-radius: 8px;
  background: #78db49;
  color: #0d1709;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
}

.account-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.google-auth-slot {
  min-width: 220px;
}

.google-signin-target {
  min-height: 40px;
}

.guest-btn {
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(12, 18, 13, 0.75);
  color: #d9ead6;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
}

.play-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.field,
.server,
.launch {
  width: 100%;
  border: 0;
  border-radius: 10px;
  height: 60px;
  font-size: 29px;
  padding: 0 18px;
}

.field,
.server {
  background: rgba(233, 247, 223, 0.93);
  color: #081006;
}

.launch {
  background: linear-gradient(180deg, var(--accent), #3da40f);
  color: #f4ffe9;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, filter 160ms ease;
}

.launch:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.footer-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
}

.bottom-stats {
  position: absolute;
  left: 24px;
  bottom: 18px;
  z-index: 3;
  border: 1px solid rgba(157, 236, 123, 0.2);
  background: rgba(4, 10, 6, 0.7);
  backdrop-filter: blur(4px);
  padding: 12px 14px;
  display: flex;
  gap: 18px;
}

.bottom-stats .hp {
  color: var(--accent-strong);
  font-size: 30px;
  line-height: 1;
}

.bottom-stats .meta {
  font-size: 12px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

@keyframes drift {
  from {
    transform: perspective(900px) rotateX(64deg) translateY(22vh) translateX(-10px);
  }
  to {
    transform: perspective(900px) rotateX(64deg) translateY(22vh) translateX(38px);
  }
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
    margin-top: 120px;
  }

  .side-menu {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .side-menu button {
    font-size: 20px;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
  }

  .bottom-stats {
    right: 24px;
    left: auto;
  }
}

@media (max-width: 640px) {
  .menu-scene {
    padding: 16px;
  }

  .hud-top {
    left: 16px;
    right: 16px;
    top: 12px;
    flex-direction: column;
    gap: 6px;
  }

  .status {
    text-align: left;
    font-size: 12px;
  }

  .layout {
    margin-top: 150px;
  }

  .play-card {
    padding: 18px;
    border-radius: 12px;
  }

  .field,
  .server,
  .launch {
    height: 54px;
    font-size: 24px;
  }

  .bottom-stats {
    position: static;
    margin-top: 14px;
  }
}
`;

const markup = `
<main class="menu-scene" data-screen="menu">
  <header class="hud-top">
    <section class="brand">
      <h1>ZOMBS.IO</h1>
      <p>Build. Defend. Survive.</p>
    </section>
    <aside class="status">US-EAST // tick 60 // ping 42ms // infected sectors: 3</aside>
  </header>

  <section class="layout">
    <nav class="side-menu" aria-label="Main menu actions">
      <button data-view="play" aria-current="true">PLAY</button>
      <button data-view="loadout">LOADOUT</button>
      <button data-view="settings">SETTINGS</button>
      <button data-view="account">ACCOUNT</button>
    </nav>

    <section class="play-card" aria-label="Server join card">
      <div class="card-top">
        <h2 id="menu-title">OUTBREAK SECTOR</h2>
        <span class="danger-pill">Night +1 incoming</span>
      </div>

      <div class="metrics" id="menu-metrics">
        <span>Survivors: 284</span>
        <span>Alive: 152</span>
        <span>Queue: 3</span>
      </div>

      <div class="account-gate" id="account-gate">
        <span id="account-gate-text">Account required to deploy.</span>
        <div class="account-actions">
          <div class="google-auth-slot">
            <button class="account-btn" id="account-btn" type="button">Loading...</button>
            <div class="google-signin-target" id="google-signin-target" hidden></div>
          </div>
          <button class="guest-btn" id="guest-btn">Continue as Guest</button>
        </div>
      </div>

      <div class="play-grid">
        <input class="field" type="text" value="Player-071" aria-label="Player name" />

        <select class="server" aria-label="Server selector">
          <option>US East #1 [High]</option>
          <option>US Central #2 [Medium]</option>
          <option>EU West #4 [Low]</option>
        </select>

        <button class="launch" id="launch-btn">Deploy</button>
      </div>

      <label class="footer-row">
        <input type="checkbox" /> Disable particles
      </label>
    </section>
  </section>

  <footer class="bottom-stats" aria-label="Player progression">
    <div class="hp">250</div>
    <div>
      <div class="meta">Level 8</div>
      <div class="meta">Gold 1320</div>
      <div class="meta">Bonds 0</div>
    </div>
  </footer>
</main>
<div id="game-root" hidden></div>
`;

type MenuMode = "play" | "loadout" | "settings" | "account";
type AuthMode = "none" | "guest" | "google";
type RuntimeConfig = {
  googleClientId: string | null;
  protocolVersion?: number;
  worldSize?: { w: number; h: number };
};
type GoogleCredentialResponse = { credential?: string };
type GoogleIdApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      logo_alignment?: "left" | "center";
    },
  ) => void;
  prompt: () => void;
};
type GoogleApi = { accounts?: { id?: GoogleIdApi } };
type MetaProgress = {
  coins: number;
  unlockedScout: boolean;
};

const DEFAULT_META_PROGRESS: MetaProgress = {
  coins: 100,
  unlockedScout: false,
};

const menuState: {
  mode: MenuMode;
  menuTitle: string;
  started: boolean;
  hasAccount: boolean;
} = {
  mode: "play",
  menuTitle: "OUTBREAK SECTOR",
  started: false,
  hasAccount: false,
};

const authState: {
  googleClientId: string | null;
  googleIdToken: string | null;
  googleEmail: string | null;
  googleSubjectId: string | null;
  authMode: AuthMode;
  initialized: boolean;
  errorMessage: string | null;
} = {
  googleClientId: null,
  googleIdToken: null,
  googleEmail: null,
  googleSubjectId: null,
  authMode: "none",
  initialized: false,
  errorMessage: null,
};

let metaProgress: MetaProgress = { ...DEFAULT_META_PROGRESS };
let protocolVersion = 1;
let runtimeWorldSize = { w: 2000, h: 2000 };

const titles: Record<MenuMode, string> = {
  play: "OUTBREAK SECTOR",
  loadout: "LOADOUT",
  settings: "SETTINGS",
  account: "ACCOUNT",
};

const styleNode = document.createElement("style");
styleNode.textContent = styleText;
document.head.appendChild(styleNode);
document.body.innerHTML = markup;

const titleEl = document.getElementById("menu-title");
const sideButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".side-menu button"),
);
const launchBtn = document.getElementById("launch-btn");
const accountGate = document.getElementById("account-gate");
const accountGateText = document.getElementById("account-gate-text");
const accountBtn = document.getElementById("account-btn");
const googleSignInTarget = document.getElementById("google-signin-target");
const guestBtn = document.getElementById("guest-btn");
const menuRoot = document.querySelector<HTMLElement>('[data-screen="menu"]');
const gameRoot = document.getElementById("game-root");
let googleButtonRendered = false;
const gameConfig = new GameConfig();
gameConfig.protocolVersion = protocolVersion;
gameConfig.worldSize = { ...runtimeWorldSize };
const gameClient = new GameClient(gameConfig);
gameClient.bindInput(window);

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const payloadBase64Url = jwt.split(".")[1];
  if (!payloadBase64Url) {
    return null;
  }

  const payloadBase64 = payloadBase64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payloadBase64Url.length / 4) * 4, "=");
  try {
    return JSON.parse(atob(payloadBase64)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const deriveEmailFromToken = (jwt: string): string | null => {
  const payload = decodeJwtPayload(jwt);
  const emailClaim = payload?.email;
  return typeof emailClaim === "string" ? emailClaim : null;
};

const deriveSubjectFromToken = (jwt: string): string | null => {
  const payload = decodeJwtPayload(jwt);
  const subClaim = payload?.sub;
  return typeof subClaim === "string" ? subClaim : null;
};

const getGoogleIdApi = (): GoogleIdApi | null => {
  return ((window.google as GoogleApi | undefined)?.accounts?.id ??
    null) as GoogleIdApi | null;
};

const metaStorageKey = (googleSubjectId: string): string =>
  `zombs-meta-progress:${googleSubjectId}`;

const loadMetaProgress = (): void => {
  if (authState.authMode !== "google" || !authState.googleSubjectId) {
    metaProgress = { ...DEFAULT_META_PROGRESS };
    return;
  }

  const rawPayload = window.localStorage.getItem(
    metaStorageKey(authState.googleSubjectId),
  );
  if (!rawPayload) {
    metaProgress = { ...DEFAULT_META_PROGRESS };
    return;
  }

  try {
    const parsed = JSON.parse(rawPayload) as Partial<MetaProgress>;
    metaProgress = {
      coins:
        typeof parsed.coins === "number" && Number.isFinite(parsed.coins)
          ? Math.max(0, Math.floor(parsed.coins))
          : DEFAULT_META_PROGRESS.coins,
      unlockedScout:
        typeof parsed.unlockedScout === "boolean"
          ? parsed.unlockedScout
          : DEFAULT_META_PROGRESS.unlockedScout,
    };
  } catch {
    metaProgress = { ...DEFAULT_META_PROGRESS };
  }
};

const persistMetaProgress = (): void => {
  if (authState.authMode !== "google" || !authState.googleSubjectId) {
    return;
  }

  window.localStorage.setItem(
    metaStorageKey(authState.googleSubjectId),
    JSON.stringify(metaProgress),
  );
};

const syncGoogleSignInButton = (): void => {
  if (!accountBtn || !googleSignInTarget) {
    return;
  }

  const fallbackButton = accountBtn as HTMLButtonElement;
  const shouldShowGoogleButton = authState.initialized && !menuState.hasAccount;

  fallbackButton.hidden = shouldShowGoogleButton;
  googleSignInTarget.hidden = !shouldShowGoogleButton;

  if (!shouldShowGoogleButton || googleButtonRendered) {
    return;
  }

  const googleIdApi = getGoogleIdApi();
  if (!googleIdApi) {
    fallbackButton.hidden = false;
    googleSignInTarget.hidden = true;
    return;
  }

  googleSignInTarget.replaceChildren();
  googleIdApi.renderButton(googleSignInTarget, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    width: 240,
    logo_alignment: "left",
  });
  googleButtonRendered = true;
};

const refreshGateUi = () => {
  if (
    !launchBtn ||
    !accountGate ||
    !accountGateText ||
    !accountBtn ||
    !guestBtn
  ) {
    return;
  }

  const deployButton = launchBtn as HTMLButtonElement;
  const createButton = accountBtn as HTMLButtonElement;
  const continueAsGuestButton = guestBtn as HTMLButtonElement;
  if (menuState.hasAccount) {
    accountGate.classList.add("ok");
    const suffix = authState.googleEmail ? ` (${authState.googleEmail})` : "";
    accountGateText.textContent = `Google account verified${suffix}. You can deploy.`;
    createButton.textContent = "Account Ready";
    createButton.disabled = true;
    continueAsGuestButton.disabled = false;
    deployButton.disabled = false;
  } else if (authState.authMode === "guest") {
    accountGate.classList.add("ok");
    accountGateText.textContent =
      "Guest session active. Progress will not be saved.";
    createButton.textContent = authState.initialized
      ? "Sign in with Google"
      : authState.errorMessage
        ? "Google Sign-in Unavailable"
        : "Loading...";
    createButton.disabled = !authState.initialized;
    continueAsGuestButton.textContent = "Guest Active";
    continueAsGuestButton.disabled = true;
    deployButton.disabled = false;
  } else {
    accountGate.classList.remove("ok");
    accountGateText.textContent =
      authState.errorMessage ??
      (authState.initialized
        ? "Sign in with Google to deploy."
        : "Preparing Google sign-in...");
    createButton.textContent = authState.initialized
      ? "Sign in with Google"
      : authState.errorMessage
        ? "Google Sign-in Unavailable"
        : "Loading...";
    createButton.disabled = !authState.initialized;
    continueAsGuestButton.textContent = "Continue as Guest";
    continueAsGuestButton.disabled = false;
    deployButton.disabled = authState.authMode === "none";
  }

  syncGoogleSignInButton();
};

const updateMode = (mode: MenuMode) => {
  menuState.mode = mode;
  menuState.menuTitle = titles[mode];
  if (titleEl) {
    titleEl.textContent = menuState.menuTitle;
  }
  sideButtons.forEach((button) => {
    button.setAttribute(
      "aria-current",
      button.dataset.view === mode ? "true" : "false",
    );
  });
};

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const requested = button.dataset.view as MenuMode | undefined;
    if (!requested) {
      return;
    }
    updateMode(requested);
  });
});

launchBtn?.addEventListener("click", () => {
  if (authState.authMode === "none") {
    updateMode("account");
    if (accountGateText) {
      accountGateText.textContent =
        "Sign in with Google or continue as guest first.";
    }
    return;
  }

  const button = launchBtn as HTMLButtonElement;
  button.textContent = "Connecting...";
  button.disabled = true;
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
  const token =
    authState.authMode === "google"
      ? (authState.googleIdToken ?? undefined)
      : undefined;
  if (!gameRoot) {
    if (accountGateText) {
      accountGateText.textContent = "Game root is unavailable.";
    }
    button.textContent = "Deploy";
    button.disabled = false;
    return;
  }

  void gameClient
    .initRenderer(gameRoot)
    .then(() => {
      gameClient.start(wsUrl, token);
    })
    .catch(() => {
      if (accountGateText) {
        accountGateText.textContent =
          "Renderer failed to load. Check network and refresh.";
      }
      button.textContent = "Deploy";
      button.disabled = authState.authMode === "none";
    });
});

accountBtn?.addEventListener("click", () => {
  if (menuState.hasAccount) {
    return;
  }
  if (!authState.initialized) {
    return;
  }
  if (!googleSignInTarget?.hidden) {
    return;
  }
  getGoogleIdApi()?.prompt();
});

guestBtn?.addEventListener("click", () => {
  authState.authMode = "guest";
  authState.googleIdToken = null;
  authState.googleEmail = null;
  authState.googleSubjectId = null;
  authState.errorMessage = null;
  menuState.hasAccount = false;
  menuState.started = false;
  loadMetaProgress();
  updateMode("play");
  refreshGateUi();
});

gameClient.networkClient.onOpen(() => {
  menuState.started = true;
  if (gameRoot) {
    gameRoot.hidden = false;
  }
  if (menuRoot) {
    menuRoot.style.display = "none";
  }
  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Connected";
    button.disabled = true;
  }
});

gameClient.networkClient.onClose(() => {
  if (!launchBtn) {
    return;
  }

  const button = launchBtn as HTMLButtonElement;
  button.textContent = "Deploy";
  button.disabled = authState.authMode === "none";
  menuState.started = false;
  if (gameRoot) {
    gameRoot.hidden = true;
  }
  if (menuRoot) {
    menuRoot.style.display = "";
  }
});

gameClient.networkClient.onError((message) => {
  if (message === "auth_invalid" || message === "auth_not_configured") {
    menuState.hasAccount = false;
    menuState.started = false;
    if (authState.authMode === "google") {
      authState.googleIdToken = null;
      authState.googleEmail = null;
      authState.googleSubjectId = null;
      authState.authMode = "none";
      authState.errorMessage =
        message === "auth_not_configured"
          ? "Google sign-in unavailable. Continue as guest or configure GOOGLE_CLIENT_ID."
          : "Google sign-in expired. Please sign in again or continue as guest.";
      loadMetaProgress();
    }
    updateMode("account");
  }

  if (message === "socket_error" && accountGateText) {
    accountGateText.textContent =
      "Connection failed before gameplay started. Check the server and refresh.";
  }

  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Deploy";
    button.disabled = authState.authMode === "none";
  }
  refreshGateUi();
});

const loadGoogleScript = async (): Promise<void> => {
  if (getGoogleIdApi()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      if (getGoogleIdApi()) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("script_error")),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("script_error")), {
      once: true,
    });
    document.head.appendChild(script);
  });
};

const initializeGoogleAuth = async (): Promise<void> => {
  try {
    const response = await fetch("/runtime-config");
    if (!response.ok) {
      throw new Error("runtime_config_error");
    }
    const runtimeConfig = (await response.json()) as RuntimeConfig;
    authState.googleClientId = runtimeConfig.googleClientId;
    if (
      typeof runtimeConfig.protocolVersion === "number" &&
      Number.isFinite(runtimeConfig.protocolVersion)
    ) {
      protocolVersion = runtimeConfig.protocolVersion;
      gameConfig.protocolVersion = protocolVersion;
    }
    if (
      runtimeConfig.worldSize &&
      Number.isFinite(runtimeConfig.worldSize.w) &&
      Number.isFinite(runtimeConfig.worldSize.h) &&
      runtimeConfig.worldSize.w > 0 &&
      runtimeConfig.worldSize.h > 0
    ) {
      runtimeWorldSize = {
        w: runtimeConfig.worldSize.w,
        h: runtimeConfig.worldSize.h,
      };
      gameClient.setWorldSize(runtimeWorldSize);
    }
  } catch {
    authState.errorMessage = "Unable to load auth config.";
    refreshGateUi();
    return;
  }

  if (!authState.googleClientId) {
    authState.errorMessage =
      "Server auth is not configured. Set GOOGLE_CLIENT_ID.";
    refreshGateUi();
    return;
  }

  try {
    await loadGoogleScript();
  } catch {
    authState.errorMessage = "Google sign-in failed to load.";
    refreshGateUi();
    return;
  }

  const googleIdApi = getGoogleIdApi();
  if (!googleIdApi) {
    authState.errorMessage = "Google sign-in API is unavailable.";
    refreshGateUi();
    return;
  }

  googleIdApi.initialize({
    client_id: authState.googleClientId,
    callback: (response) => {
      const credential = response.credential;
      if (!credential) {
        return;
      }

      authState.googleIdToken = credential;
      authState.googleEmail = deriveEmailFromToken(credential);
      authState.googleSubjectId = deriveSubjectFromToken(credential);
      authState.authMode = "google";
      authState.errorMessage = null;
      menuState.hasAccount = true;
      loadMetaProgress();
      updateMode("play");
      refreshGateUi();
    },
  });

  authState.initialized = true;
  refreshGateUi();
};

refreshGateUi();
loadMetaProgress();
void initializeGoogleAuth();

declare global {
  interface Window {
    google?: GoogleApi;
  }
}

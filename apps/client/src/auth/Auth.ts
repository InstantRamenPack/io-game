export type AuthMode = "none" | "guest" | "google";

export type RuntimeConfig = {
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

export type AuthState = {
  googleClientId: string | null;
  googleIdToken: string | null;
  googleEmail: string | null;
  googleSubjectId: string | null;
  authMode: AuthMode;
  initialized: boolean;
  errorMessage: string | null;
};

export type AuthGateViewState = {
  showReadyState: boolean;
  gateText: string;
  accountButtonText: string;
  accountButtonDisabled: boolean;
  deployButtonDisabled: boolean;
  showGoogleButton: boolean;
};

type AuthListener = (state: Readonly<AuthState>) => void;

const DEFAULT_META_PROGRESS: MetaProgress = {
  coins: 100,
  unlockedScout: false,
};

export class AuthController {
  private readonly state: AuthState = {
    googleClientId: null,
    googleIdToken: null,
    googleEmail: null,
    googleSubjectId: null,
    authMode: "none",
    initialized: false,
    errorMessage: null,
  };
  private readonly listeners: AuthListener[] = [];
  private googleButtonRendered = false;
  private metaProgress: MetaProgress = { ...DEFAULT_META_PROGRESS };

  onChange(listener: AuthListener): void {
    this.listeners.push(listener);
  }

  getState(): Readonly<AuthState> {
    return this.state;
  }

  hasVerifiedAccount(): boolean {
    return this.state.authMode === "google";
  }

  canRenderGoogleButton(): boolean {
    return (
      this.state.authMode !== "google" &&
      this.state.initialized &&
      !this.state.errorMessage &&
      Boolean(this.state.googleClientId) &&
      Boolean(this.getGoogleIdApi())
    );
  }

  async initialize(
    onRuntimeConfig: (runtimeConfig: RuntimeConfig) => void,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch("/runtime-config");
    } catch {
      this.state.errorMessage = "Unable to load auth config.";
      this.emit();
      return;
    }

    if (!response.ok) {
      this.state.errorMessage = "Unable to load auth config.";
      this.emit();
      return;
    }

    let runtimeConfig: RuntimeConfig;
    try {
      runtimeConfig = (await response.json()) as RuntimeConfig;
    } catch {
      this.state.errorMessage = "Unable to load auth config.";
      this.emit();
      return;
    }

    this.state.googleClientId = runtimeConfig.googleClientId;
    onRuntimeConfig(runtimeConfig);

    if (!this.state.googleClientId) {
      this.state.errorMessage =
        "Server auth is not configured. Set GOOGLE_CLIENT_ID.";
      this.emit();
      return;
    }

    try {
      await this.loadGoogleScript();
    } catch {
      this.state.errorMessage = "Google sign-in failed to load.";
      this.emit();
      return;
    }

    const googleIdApi = this.getGoogleIdApi();
    if (!googleIdApi) {
      this.state.errorMessage = "Google sign-in API is unavailable.";
      this.emit();
      return;
    }

    googleIdApi.initialize({
      client_id: this.state.googleClientId,
      callback: (response) => {
        const credential = response.credential;
        if (!credential) {
          return;
        }

        this.state.googleIdToken = credential;
        this.state.googleEmail = this.deriveEmailFromToken(credential);
        this.state.googleSubjectId = this.deriveSubjectFromToken(credential);
        this.state.authMode = "google";
        this.state.errorMessage = null;
        this.loadMetaProgress();
        this.emit();
      },
    });

    this.state.initialized = true;
    this.loadMetaProgress();
    this.emit();
  }

  activateGuest(): void {
    this.state.authMode = "guest";
    this.state.googleIdToken = null;
    this.state.googleEmail = null;
    this.state.googleSubjectId = null;
    this.state.errorMessage = null;
    this.loadMetaProgress();
    this.emit();
  }

  promptGoogleSignIn(): void {
    this.getGoogleIdApi()?.prompt();
  }

  renderGoogleButton(parent: HTMLElement): void {
    if (this.googleButtonRendered || this.hasVerifiedAccount()) {
      return;
    }

    const googleIdApi = this.getGoogleIdApi();
    if (!googleIdApi) {
      return;
    }

    parent.replaceChildren();
    googleIdApi.renderButton(parent, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 240,
      logo_alignment: "left",
    });
    this.googleButtonRendered = true;
  }

  handleNetworkError(message: string): boolean {
    if (message !== "auth_invalid" && message !== "auth_not_configured") {
      return false;
    }

    if (this.state.authMode === "google") {
      this.state.googleIdToken = null;
      this.state.googleEmail = null;
      this.state.googleSubjectId = null;
      this.state.authMode = "none";
      this.state.errorMessage =
        message === "auth_not_configured"
          ? "Google sign-in unavailable. Deploy will continue as guest."
          : "Google sign-in expired. Deploy will continue as guest unless you sign in again.";
      this.loadMetaProgress();
    }

    this.emit();
    return true;
  }

  getLaunchToken(): string | undefined {
    if (this.state.authMode !== "google") {
      return undefined;
    }

    return this.state.googleIdToken ?? undefined;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private decodeJwtPayload(jwt: string): Record<string, unknown> | null {
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
  }

  private deriveEmailFromToken(jwt: string): string | null {
    const payload = this.decodeJwtPayload(jwt);
    const emailClaim = payload?.email;
    return typeof emailClaim === "string" ? emailClaim : null;
  }

  private deriveSubjectFromToken(jwt: string): string | null {
    const payload = this.decodeJwtPayload(jwt);
    const subClaim = payload?.sub;
    return typeof subClaim === "string" ? subClaim : null;
  }

  private getGoogleIdApi(): GoogleIdApi | null {
    return ((window.google as GoogleApi | undefined)?.accounts?.id ??
      null) as GoogleIdApi | null;
  }

  private metaStorageKey(googleSubjectId: string): string {
    return `zombs-meta-progress:${googleSubjectId}`;
  }

  private loadMetaProgress(): void {
    if (this.state.authMode !== "google" || !this.state.googleSubjectId) {
      this.metaProgress = { ...DEFAULT_META_PROGRESS };
      return;
    }

    const rawPayload = window.localStorage.getItem(
      this.metaStorageKey(this.state.googleSubjectId),
    );
    if (!rawPayload) {
      this.metaProgress = { ...DEFAULT_META_PROGRESS };
      return;
    }

    try {
      const parsed = JSON.parse(rawPayload) as Partial<MetaProgress>;
      this.metaProgress = {
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
      this.metaProgress = { ...DEFAULT_META_PROGRESS };
    }
  }

  private async loadGoogleScript(): Promise<void> {
    if (this.getGoogleIdApi()) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finalize = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        callback();
      };
      const timeoutId = window.setTimeout(() => {
        finalize(() => reject(new Error("script_timeout")));
      }, 5000);
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (existing) {
        if (this.getGoogleIdApi()) {
          finalize(() => resolve());
          return;
        }
        existing.addEventListener("load", () => finalize(() => resolve()), {
          once: true,
        });
        existing.addEventListener(
          "error",
          () => finalize(() => reject(new Error("script_error"))),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => finalize(() => resolve()), {
        once: true,
      });
      script.addEventListener(
        "error",
        () => finalize(() => reject(new Error("script_error"))),
        { once: true },
      );
      document.head.appendChild(script);
    });
  }
}

export function createAuthGateViewState(
  authState: Readonly<AuthState>,
): AuthGateViewState {
  if (authState.authMode === "google") {
    const suffix = authState.googleEmail ? ` (${authState.googleEmail})` : "";
    return {
      showReadyState: true,
      gateText: `Google account verified${suffix}. You can deploy.`,
      accountButtonText: "Account Ready",
      accountButtonDisabled: true,
      deployButtonDisabled: false,
      showGoogleButton: false,
    };
  }

  if (authState.authMode === "guest") {
    return {
      showReadyState: true,
      gateText:
        "Guest session active. Sign in with Google if you want saved progress.",
      accountButtonText: authState.initialized
        ? "Sign in with Google"
        : authState.errorMessage
          ? "Google Sign-in Unavailable"
          : "Loading...",
      accountButtonDisabled: !authState.initialized,
      deployButtonDisabled: false,
      showGoogleButton:
        authState.initialized &&
        !authState.errorMessage &&
        Boolean(authState.googleClientId),
    };
  }

  return {
    showReadyState: true,
    gateText:
      authState.errorMessage ??
      (authState.initialized
        ? "Deploy as guest now, or sign in with Google to save progress."
        : "Preparing sign-in. Deploy will continue as guest."),
    accountButtonText: authState.initialized
      ? "Sign in with Google"
      : authState.errorMessage
        ? "Google Sign-in Unavailable"
        : "Loading...",
    accountButtonDisabled: !authState.initialized,
    deployButtonDisabled: false,
    showGoogleButton:
      authState.initialized &&
      !authState.errorMessage &&
      Boolean(authState.googleClientId),
  };
}

declare global {
  interface Window {
    google?: GoogleApi;
  }
}

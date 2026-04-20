type GoogleTokenInfoResponse = {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
  sub?: string;
};

type AuthenticatedUser = {
  googleSubjectId: string;
  email?: string;
};

/**
 * Verifies Google ID tokens against Google's tokeninfo endpoint and expected audience.
 * This keeps auth checks server-side and prevents unauthenticated socket sessions.
 */
export class AuthService {
  private readonly googleClientId: string | undefined;

  constructor(googleClientId: string | undefined) {
    this.googleClientId = googleClientId;
  }

  public isConfigured(): boolean {
    return Boolean(this.googleClientId);
  }

  public async verifyGoogleIdToken(
    googleIdToken: string,
  ): Promise<AuthenticatedUser | null> {
    if (!this.googleClientId) {
      return null;
    }

    const tokenInfoUrl =
      "https://oauth2.googleapis.com/tokeninfo?id_token=" +
      encodeURIComponent(googleIdToken);

    let response: Response;
    try {
      response = await fetch(tokenInfoUrl, {
        method: "GET",
        headers: { accept: "application/json" },
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let tokenInfo: GoogleTokenInfoResponse;
    try {
      tokenInfo = (await response.json()) as GoogleTokenInfoResponse;
    } catch {
      return null;
    }

    if (tokenInfo.aud !== this.googleClientId) {
      return null;
    }

    if (tokenInfo.email_verified === "false") {
      return null;
    }

    if (!tokenInfo.sub) {
      return null;
    }

    return {
      googleSubjectId: tokenInfo.sub,
      email: tokenInfo.email,
    };
  }
}

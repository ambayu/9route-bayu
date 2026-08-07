/**
 * Regression tests untuk fix OAuth Antigravity:
 *  1. Payload token exchange ke Google (grant_type/client_id/secret/code/redirect_uri)
 *  2. postExchange TIDAK crash saat header fingerprint (X-Goog-Api-Client / Client-Metadata)
 *     tidak terdefinisi di config (bug ERR_HTTP_INVALID_HEADER_VALUE).
 *  3. DEFAULT_LOOPBACK_CALLBACK memakai port unik (bukan 8080) agar tidak
 *     bertabrakan dengan callback server Antigravity IDE / gemini-cli lokal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import antigravity from "../../src/lib/oauth/providers/antigravity.js";
import { ANTIGRAVITY_CONFIG } from "../../src/lib/oauth/constants/oauth.js";
import {
  DEFAULT_LOOPBACK_CALLBACK,
  LOOPBACK_MANUAL_OAUTH_PROVIDERS,
} from "../../src/shared/constants/index.js";

const REDIRECT = "http://localhost:59123/callback";

describe("antigravity OAuth provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("exchangeToken", () => {
    it("mengirim payload authorization_code yang benar ke token endpoint Google", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const tokens = await antigravity.exchangeToken(
        antigravity.config,
        "CODE_ABC",
        REDIRECT,
        undefined,
        "STATE_1"
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(opts.method).toBe("POST");
      const body = new URLSearchParams(opts.body);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_id")).toBe(antigravity.config.clientId);
      expect(body.get("client_secret")).toBe(antigravity.config.clientSecret);
      expect(body.get("code")).toBe("CODE_ABC");
      expect(body.get("redirect_uri")).toBe(REDIRECT);
      expect(tokens.access_token).toBe("at");
    });

    it("melempar Token exchange failed saat Google menolak (invalid_grant)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error":"invalid_grant","error_description":"Bad Request"}',
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        antigravity.exchangeToken(antigravity.config, "CODE_OLD", REDIRECT, undefined, "S")
      ).rejects.toThrow(/Token exchange failed/);
    });
  });

  describe("postExchange (tidak crash saat header fingerprint tidak ada)", () => {
    it("header X-Goog-Api-Client / Client-Metadata tidak terkirim undefined", async () => {
      // Config asli TIDAK punya loadCodeAssistApiClient / loadCodeAssistClientMetadata
      expect(ANTIGRAVITY_CONFIG.loadCodeAssistApiClient).toBeUndefined();
      expect(ANTIGRAVITY_CONFIG.loadCodeAssistClientMetadata).toBeUndefined();

      const fetchMock = vi
        .fn()
        // userinfo
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ email: "user@example.com" }),
        })
        // loadCodeAssist
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            cloudaicompanionProject: { id: "proj-1" },
            allowedTiers: [{ isDefault: true, id: "tier-1" }],
          }),
        })
        // onboardUser (fire-and-forget) — gagalkan supaya loop berhenti cepat
        .mockRejectedValue(new Error("onboarding skipped"));
      vi.stubGlobal("fetch", fetchMock);

      const extra = await antigravity.postExchange({ access_token: "at" });

      expect(extra.projectId).toBe("proj-1");
      expect(extra.userInfo.email).toBe("user@example.com");

      // Tidak ada header dengan nilai undefined di SEMUA request keluar
      for (const [, opts] of fetchMock.mock.calls) {
        if (opts?.headers) {
          for (const value of Object.values(opts.headers)) {
            expect(value).not.toBeUndefined();
            expect(value).not.toBe(null);
          }
        }
      }
    });

    it("postExchange tetap resolve walau loadCodeAssist gagal (fail-open)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) }) // userinfo
        .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "denied" }) // loadCodeAssist
        .mockRejectedValue(new Error("onboarding skipped"));
      vi.stubGlobal("fetch", fetchMock);

      const extra = await antigravity.postExchange({ access_token: "at" });
      expect(extra.projectId).toBe("");
    });
  });

  describe("buildAuthUrl", () => {
    it("menyertakan redirect_uri, state, dan scope", () => {
      const url = antigravity.buildAuthUrl(antigravity.config, REDIRECT, "STATE_X");
      const u = new URL(url);
      expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(u.searchParams.get("state")).toBe("STATE_X");
      expect(u.searchParams.get("client_id")).toBe(antigravity.config.clientId);
      expect(u.searchParams.get("response_type")).toBe("code");
      expect(u.searchParams.get("access_type")).toBe("offline");
    });
  });
});

describe("DEFAULT_LOOPBACK_CALLBACK (fix tabrakan port 8080)", () => {
  it("memakai port unik 5-digit, bukan 8080", () => {
    expect(DEFAULT_LOOPBACK_CALLBACK).toMatch(/^http:\/\/localhost:\d{5}\/callback$/);
    expect(DEFAULT_LOOPBACK_CALLBACK).not.toContain(":8080");
  });

  it("antigravity & gemini-cli terdaftar sebagai loopback manual providers", () => {
    expect(LOOPBACK_MANUAL_OAUTH_PROVIDERS.has("antigravity")).toBe(true);
    expect(LOOPBACK_MANUAL_OAUTH_PROVIDERS.has("gemini-cli")).toBe(true);
  });
});

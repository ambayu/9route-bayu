// Shared OAuth constants — used by both the client modal and server routes.
//
// Google OAuth public/installed-app clients accept ANY loopback port, so the
// dashboard's manual remote-login flow must use a FIXED loopback URI that is
// stable across the authorize + exchange steps (Google rejects a code if the
// exchange redirect_uri differs from the one used at authorize time).
//
// Port 8080 is the default loopback callback for several Google tools
// (gemini-cli, Antigravity IDE, etc.). If one of those tools is running on the
// user's machine, its local callback server will consume the authorization
// code before the user can paste it into the dashboard, which makes Google
// return `invalid_grant` ("Bad Request") on the dashboard's exchange attempt.
// Use a distinctive high port (dynamic/private range) to avoid the collision.
export const DEFAULT_LOOPBACK_CALLBACK = "http://localhost:59123/callback";

// Providers that use the loopback manual-callback flow when the dashboard is
// served remotely (their Google clients accept loopback redirects).
export const LOOPBACK_MANUAL_OAUTH_PROVIDERS = new Set(["antigravity", "gemini-cli"]);

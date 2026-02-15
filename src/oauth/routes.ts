import { Router, Request, Response } from "express";
import { config } from "../config.js";
import {
  getUserByEmail,
  verifyPassword,
} from "../db/users.js";
import {
  createAuthorizationCode,
  consumeAuthorizationCode,
  issueTokenPair,
  refreshAccessToken,
} from "../db/oauth.js";

export const oauthRouter = Router();

/**
 * GET /oauth/authorize
 *
 * Authorization endpoint. Shows a login form for the user to authenticate.
 * Query params: client_id, redirect_uri, response_type, state
 */
oauthRouter.get("/authorize", (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, state } = req.query;

  if (response_type !== "code") {
    res.status(400).send("Unsupported response_type. Only 'code' is supported.");
    return;
  }

  if (client_id !== config.oauth.clientId()) {
    res.status(400).send("Invalid client_id.");
    return;
  }

  // Render login form
  res.send(renderLoginPage(
    client_id as string,
    redirect_uri as string,
    state as string,
    undefined
  ));
});

/**
 * POST /oauth/authorize
 *
 * Handles login form submission. If valid, redirects to redirect_uri with auth code.
 */
oauthRouter.post("/authorize", async (req: Request, res: Response) => {
  const { email, password, client_id, redirect_uri, state } = req.body;

  if (!email || !password) {
    res.send(renderLoginPage(client_id, redirect_uri, state, "Email and password are required."));
    return;
  }

  if (client_id !== config.oauth.clientId()) {
    res.status(400).send("Invalid client_id.");
    return;
  }

  const user = getUserByEmail(email);
  if (!user || user.status !== "active") {
    res.send(
      renderLoginPage(client_id, redirect_uri, state, "Invalid email or account not active.")
    );
    return;
  }

  const valid = await verifyPassword(user, password);
  if (!valid) {
    res.send(renderLoginPage(client_id, redirect_uri, state, "Invalid email or password."));
    return;
  }

  // Issue authorization code
  const code = createAuthorizationCode(user.id, client_id, redirect_uri);

  // Redirect to Claude's callback
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  res.redirect(redirectUrl.toString());
});

/**
 * POST /oauth/token
 *
 * Token endpoint. Exchanges an auth code for access + refresh tokens,
 * or refreshes an existing token pair.
 */
oauthRouter.post("/token", (req: Request, res: Response) => {
  const { grant_type } = req.body;

  if (grant_type === "authorization_code") {
    handleAuthorizationCodeGrant(req, res);
  } else if (grant_type === "refresh_token") {
    handleRefreshTokenGrant(req, res);
  } else {
    res.status(400).json({ error: "unsupported_grant_type" });
  }
});

function handleAuthorizationCodeGrant(req: Request, res: Response): void {
  const { code, client_id, client_secret, redirect_uri } = req.body;

  // Validate client credentials
  if (client_id !== config.oauth.clientId() || client_secret !== config.oauth.clientSecret()) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  // Consume the authorization code
  const authCode = consumeAuthorizationCode(code, client_id, redirect_uri);
  if (!authCode) {
    res.status(400).json({ error: "invalid_grant", error_description: "Invalid, expired, or already used authorization code." });
    return;
  }

  // Issue tokens
  const tokenPair = issueTokenPair(authCode.user_id);

  res.json({
    access_token: tokenPair.accessToken,
    token_type: "Bearer",
    expires_in: tokenPair.expiresIn,
    refresh_token: tokenPair.refreshToken,
  });
}

function handleRefreshTokenGrant(req: Request, res: Response): void {
  const { refresh_token, client_id, client_secret } = req.body;

  if (client_id !== config.oauth.clientId() || client_secret !== config.oauth.clientSecret()) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (!refresh_token) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token." });
    return;
  }

  const tokenPair = refreshAccessToken(refresh_token);
  if (!tokenPair) {
    res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired refresh token." });
    return;
  }

  res.json({
    access_token: tokenPair.accessToken,
    token_type: "Bearer",
    expires_in: tokenPair.expiresIn,
    refresh_token: tokenPair.refreshToken,
  });
}

/**
 * Render the OAuth login page as an HTML string.
 */
function renderLoginPage(
  clientId: string,
  redirectUri: string,
  state: string | undefined,
  error: string | undefined
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notion Bridge - Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 24px;
      font-size: 0.9rem;
    }
    .error {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 0.875rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 4px;
      color: #555;
    }
    input[type="email"], input[type="password"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    button {
      width: 100%;
      padding: 12px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 0.8rem;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Notion Bridge</h1>
    <p class="subtitle">Sign in to connect your Claude account</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state ?? "")}" />
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@yalla.coop" required autofocus />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required />
      <button type="submit">Sign in &amp; Authorise</button>
    </form>
    <p class="footer">Yalla Cooperative &middot; Notion Bridge</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

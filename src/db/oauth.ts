import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import { getDb } from "./index.js";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// --- Authorization codes ---

export interface AuthorizationCode {
  code: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export function createAuthorizationCode(
  userId: string,
  clientId: string,
  redirectUri: string
): string {
  const db = getDb();
  const code = generateToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  db.prepare(
    `INSERT INTO oauth_authorization_codes (code, user_id, client_id, redirect_uri, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(code, userId, clientId, redirectUri, expiresAt);

  return code;
}

export function consumeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string
): AuthorizationCode | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM oauth_authorization_codes
       WHERE code = ? AND client_id = ? AND redirect_uri = ? AND used = 0`
    )
    .get(code, clientId, redirectUri) as AuthorizationCode | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  // Mark as used
  db.prepare("UPDATE oauth_authorization_codes SET used = 1 WHERE code = ?").run(code);

  return row;
}

// --- Access/Refresh tokens ---

export interface OAuthToken {
  id: string;
  user_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
  revoked: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ACCESS_TOKEN_TTL = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export function issueTokenPair(userId: string): TokenPair {
  const db = getDb();
  const id = uuidv4();
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL).toISOString();

  db.prepare(
    `INSERT INTO oauth_tokens (id, user_id, access_token_hash, refresh_token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, hashToken(accessToken), hashToken(refreshToken), expiresAt);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL / 1000,
  };
}

export function validateAccessToken(accessToken: string): { userId: string } | null {
  const db = getDb();
  const hash = hashToken(accessToken);

  const row = db
    .prepare(
      `SELECT t.user_id, t.expires_at, t.revoked, u.status
       FROM oauth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.access_token_hash = ?`
    )
    .get(hash) as
    | { user_id: string; expires_at: string; revoked: number; status: string }
    | undefined;

  if (!row) return null;
  if (row.revoked) return null;
  if (row.status !== "active") return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return { userId: row.user_id };
}

export function refreshAccessToken(refreshToken: string): TokenPair | null {
  const db = getDb();
  const hash = hashToken(refreshToken);

  const row = db
    .prepare(
      `SELECT t.id, t.user_id, t.created_at, t.revoked, u.status
       FROM oauth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.refresh_token_hash = ?`
    )
    .get(hash) as
    | { id: string; user_id: string; created_at: string; revoked: number; status: string }
    | undefined;

  if (!row) return null;
  if (row.revoked) return null;
  if (row.status !== "active") return null;

  // Check refresh token hasn't expired (30 days from creation)
  const refreshExpiry = new Date(
    new Date(row.created_at).getTime() + REFRESH_TOKEN_TTL
  );
  if (refreshExpiry < new Date()) return null;

  // Revoke old token pair
  db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE id = ?").run(row.id);

  // Issue new pair
  return issueTokenPair(row.user_id);
}

export function revokeUserTokens(userId: string): void {
  const db = getDb();
  db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?").run(userId);
}

import Database from "better-sqlite3";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      invited_by TEXT
    );

    CREATE TABLE IF NOT EXISTS approved_pages (
      id TEXT PRIMARY KEY,
      notion_page_id TEXT NOT NULL UNIQUE,
      notion_url TEXT NOT NULL,
      title TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'read-write' CHECK (access_level IN ('read-write', 'read-only')),
      added_by TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (added_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      notion_page_id TEXT,
      detail TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_access ON oauth_tokens(access_token_hash);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_refresh ON oauth_tokens(refresh_token_hash);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_approved_pages_notion_id ON approved_pages(notion_page_id);
  `);
}

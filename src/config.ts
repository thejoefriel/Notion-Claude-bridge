import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  notionToken: () => requireEnv("NOTION_TOKEN"),
  baseUrl: () => requireEnv("BASE_URL"),
  sessionSecret: () => requireEnv("SESSION_SECRET"),
  oauth: {
    clientId: () => optionalEnv("OAUTH_CLIENT_ID", "notion-bridge"),
    clientSecret: () => requireEnv("OAUTH_CLIENT_SECRET"),
  },
  port: () => parseInt(optionalEnv("PORT", "3847"), 10),
  dbPath: () =>
    path.resolve(optionalEnv("DB_PATH", "./data.db")),
  rateLimitPerMinute: () =>
    parseInt(optionalEnv("RATE_LIMIT_PER_MINUTE", "30"), 10),
} as const;

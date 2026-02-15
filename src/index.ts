import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { config } from "./config.js";
import { getDb, closeDb } from "./db/index.js";
import { oauthRouter } from "./oauth/routes.js";
import { metadataRouter } from "./oauth/metadata.js";
import { adminRouter } from "./admin/routes.js";
import { handleMcpPost, handleMcpGet, handleMcpDelete, closeAllSessions } from "./mcp/server.js";
import { mcpRateLimiter } from "./middleware/rate-limit.js";

const app = express();

// --- Global middleware ---

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Session middleware (for admin panel) ---

app.use(
  session({
    secret: config.sessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.baseUrl().startsWith("https"),
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

// --- Initialize database ---
getDb();

// --- OAuth metadata ---
app.use("/.well-known", metadataRouter);

// --- OAuth endpoints ---
app.use("/oauth", oauthRouter);

// --- MCP endpoint (with rate limiting) ---
app.post("/mcp", mcpRateLimiter, handleMcpPost);
app.get("/mcp", handleMcpGet);
app.delete("/mcp", handleMcpDelete);

// --- Admin panel ---
app.use("/admin", adminRouter);

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Root redirect ---
app.get("/", (_req, res) => {
  res.redirect("/admin");
});

// --- Start server ---

const port = config.port();

const server = app.listen(port, () => {
  console.log(`Notion Bridge running on port ${port}`);
  console.log(`Admin panel: ${config.baseUrl()}/admin`);
  console.log(`MCP endpoint: ${config.baseUrl()}/mcp`);
  console.log(`OAuth authorize: ${config.baseUrl()}/oauth/authorize`);
});

// --- Graceful shutdown ---

async function shutdown() {
  console.log("\nShutting down...");
  await closeAllSessions();
  closeDb();
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  // Force close after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

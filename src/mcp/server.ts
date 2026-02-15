import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { validateAccessToken } from "../db/oauth.js";
import { registerTools } from "./tools.js";

/**
 * Maps MCP session IDs to their transports.
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Maps MCP session IDs to user IDs (populated during transport creation
 * when the bearer token is validated).
 */
const sessionUserMap = new Map<string, string>();

/**
 * Create a new McpServer instance and register all tools.
 */
function createMcpServerInstance(): McpServer {
  const server = new McpServer(
    {
      name: "notion-bridge",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  registerTools(server, sessionUserMap);

  return server;
}

/**
 * Extract and validate a bearer token from an Authorization header.
 * Returns the userId if valid, null otherwise.
 */
function authenticateRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const result = validateAccessToken(token);
  return result?.userId ?? null;
}

/**
 * Check if a JSON-RPC body is an initialize request.
 */
function isInitializeRequest(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some(
      (msg: Record<string, unknown>) => msg.method === "initialize"
    );
  }
  return (body as Record<string, unknown>)?.method === "initialize";
}

/**
 * Handle POST /mcp - JSON-RPC messages (including initialization).
 */
export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  // Authenticate the request
  const userId = authenticateRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: invalid or missing bearer token" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    // New session - must be an initialize request
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: "Bad request: missing session ID or not an initialize request" });
      return;
    }

    const mcpServer = createMcpServerInstance();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        sessionUserMap.set(sid, userId);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
        sessionUserMap.delete(transport.sessionId);
      }
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    // Existing session - validate user still matches
    const existingUserId = sessionUserMap.get(sessionId);
    if (existingUserId !== userId) {
      res.status(403).json({ error: "Forbidden: session belongs to a different user" });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  }
}

/**
 * Handle GET /mcp - SSE stream establishment.
 */
export async function handleMcpGet(req: Request, res: Response): Promise<void> {
  const userId = authenticateRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: invalid or missing bearer token" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }

  const existingUserId = sessionUserMap.get(sessionId);
  if (existingUserId !== userId) {
    res.status(403).json({ error: "Forbidden: session belongs to a different user" });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
}

/**
 * Handle DELETE /mcp - Session termination.
 */
export async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const userId = authenticateRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: invalid or missing bearer token" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
}

/**
 * Close all active MCP sessions (for graceful shutdown).
 */
export async function closeAllSessions(): Promise<void> {
  for (const [, transport] of transports) {
    try {
      await transport.close();
    } catch {
      // Ignore errors during shutdown
    }
  }
  transports.clear();
  sessionUserMap.clear();
}

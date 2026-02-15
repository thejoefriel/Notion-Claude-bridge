import { Router, Request, Response } from "express";
import { config } from "../config.js";

export const metadataRouter = Router();

/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Claude uses this to discover OAuth endpoints.
 */
metadataRouter.get("/oauth-authorization-server", (_req: Request, res: Response) => {
  const baseUrl = config.baseUrl();
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
  });
});

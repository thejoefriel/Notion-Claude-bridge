import { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
  }
}

/**
 * Middleware that ensures the request is from an authenticated admin user.
 * Redirects to /admin/login if not authenticated.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId || req.session?.userRole !== "admin") {
    res.redirect("/admin/login");
    return;
  }
  next();
}

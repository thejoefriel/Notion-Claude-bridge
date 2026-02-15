import { v4 as uuidv4 } from "uuid";
import { getDb } from "./index.js";

export interface AuditEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  notion_page_id: string | null;
  detail: string | null;
  timestamp: string;
}

export interface AuditFilter {
  userId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export function logAudit(
  userId: string,
  userName: string,
  action: string,
  notionPageId?: string,
  detail?: Record<string, unknown>
): void {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO audit_log (id, user_id, user_name, action, notion_page_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, userName, action, notionPageId ?? null, detail ? JSON.stringify(detail) : null);
}

export function queryAuditLog(filter: AuditFilter = {}): { entries: AuditEntry[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.userId) {
    conditions.push("user_id = ?");
    params.push(filter.userId);
  }
  if (filter.action) {
    conditions.push("action = ?");
    params.push(filter.action);
  }
  if (filter.fromDate) {
    conditions.push("timestamp >= ?");
    params.push(filter.fromDate);
  }
  if (filter.toDate) {
    conditions.push("timestamp <= ?");
    params.push(filter.toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const entries = db
    .prepare(
      `SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as AuditEntry[];

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`)
    .get(...params) as { count: number };

  return { entries, total: countRow.count };
}

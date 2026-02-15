import { v4 as uuidv4 } from "uuid";
import { getDb } from "./index.js";

export interface ApprovedPage {
  id: string;
  notion_page_id: string;
  notion_url: string;
  title: string;
  access_level: "read-write" | "read-only";
  added_by: string;
  added_at: string;
}

export interface ApprovedPageCreate {
  notion_page_id: string;
  notion_url: string;
  title: string;
  access_level: "read-write" | "read-only";
  added_by: string;
}

export function addApprovedPage(data: ApprovedPageCreate): ApprovedPage {
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO approved_pages (id, notion_page_id, notion_url, title, access_level, added_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.notion_page_id, data.notion_url, data.title, data.access_level, data.added_by);

  return getApprovedPageById(id)!;
}

export function getApprovedPageById(id: string): ApprovedPage | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM approved_pages WHERE id = ?").get(id) as
    | ApprovedPage
    | undefined;
}

export function getApprovedPageByNotionId(notionPageId: string): ApprovedPage | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM approved_pages WHERE notion_page_id = ?")
    .get(notionPageId) as ApprovedPage | undefined;
}

export function listApprovedPages(): ApprovedPage[] {
  const db = getDb();
  return db.prepare("SELECT * FROM approved_pages ORDER BY added_at DESC").all() as ApprovedPage[];
}

export function updatePageAccessLevel(
  id: string,
  accessLevel: "read-write" | "read-only"
): void {
  const db = getDb();
  db.prepare("UPDATE approved_pages SET access_level = ? WHERE id = ?").run(accessLevel, id);
}

export function removeApprovedPage(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM approved_pages WHERE id = ?").run(id);
}

export function getAllApprovedNotionIds(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT notion_page_id FROM approved_pages")
    .all() as Array<{ notion_page_id: string }>;
  return rows.map((r) => r.notion_page_id);
}

import { Client } from "@notionhq/client";
import { config } from "../config.js";
import {
  BlockObjectResponse,
  PageObjectResponse,
  DatabaseObjectResponse,
  PartialBlockObjectResponse,
  SearchResponse,
  QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints.js";

let client: Client | null = null;

export function getNotionClient(): Client {
  if (!client) {
    client = new Client({ auth: config.notionToken() });
  }
  return client;
}

// --- Page operations ---

export async function getPage(pageId: string): Promise<PageObjectResponse> {
  const notion = getNotionClient();
  const response = await notion.pages.retrieve({ page_id: pageId });
  return response as PageObjectResponse;
}

export async function getPageBlocks(
  pageId: string
): Promise<(BlockObjectResponse | PartialBlockObjectResponse)[]> {
  const notion = getNotionClient();
  const blocks: (BlockObjectResponse | PartialBlockObjectResponse)[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return blocks;
}

export async function updatePageProperties(
  pageId: string,
  properties: Record<string, unknown>
): Promise<PageObjectResponse> {
  const notion = getNotionClient();
  const response = await notion.pages.update({
    page_id: pageId,
    properties: properties as PageObjectResponse["properties"],
  });
  return response as PageObjectResponse;
}

export async function appendBlocks(
  pageId: string,
  children: unknown[]
): Promise<void> {
  const notion = getNotionClient();
  // Notion API limits to 100 blocks per request
  for (let i = 0; i < children.length; i += 100) {
    const batch = children.slice(i, i + 100);
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch as Parameters<typeof notion.blocks.children.append>[0]["children"],
    });
  }
}

// --- Database operations ---

export async function getDatabase(databaseId: string): Promise<DatabaseObjectResponse> {
  const notion = getNotionClient();
  const response = await notion.databases.retrieve({ database_id: databaseId });
  return response as DatabaseObjectResponse;
}

export async function queryDatabase(
  databaseId: string,
  filter?: QueryDatabaseParameters["filter"],
  sorts?: QueryDatabaseParameters["sorts"]
): Promise<PageObjectResponse[]> {
  const notion = getNotionClient();
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;

  do {
    const params: QueryDatabaseParameters = {
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    };
    if (filter) params.filter = filter;
    if (sorts) params.sorts = sorts;

    const response = await notion.databases.query(params);
    results.push(...(response.results as PageObjectResponse[]));
    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return results;
}

// --- Create page ---

export async function createPage(params: {
  parentId: string;
  parentType: "page" | "database";
  title: string;
  properties?: Record<string, unknown>;
  children?: unknown[];
}): Promise<PageObjectResponse> {
  const notion = getNotionClient();

  const parent =
    params.parentType === "database"
      ? { database_id: params.parentId }
      : { page_id: params.parentId };

  const properties: Record<string, unknown> =
    params.parentType === "database"
      ? { ...(params.properties ?? {}), title: { title: [{ text: { content: params.title } }] } }
      : { title: { title: [{ text: { content: params.title } }] } };

  const createParams: Parameters<typeof notion.pages.create>[0] = {
    parent: parent as Parameters<typeof notion.pages.create>[0]["parent"],
    properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
  };

  if (params.children && params.children.length > 0) {
    createParams.children = params.children as Parameters<
      typeof notion.pages.create
    >[0]["children"];
  }

  const response = await notion.pages.create(createParams);
  return response as PageObjectResponse;
}

// --- Search ---

export async function searchNotion(query: string): Promise<SearchResponse> {
  const notion = getNotionClient();
  return notion.search({
    query,
    page_size: 100,
  });
}

// --- Comments ---

export async function addComment(
  pageId: string,
  text: string
): Promise<void> {
  const notion = getNotionClient();
  await notion.comments.create({
    parent: { page_id: pageId },
    rich_text: [{ type: "text", text: { content: text } }],
  });
}

// --- Parent chain resolution (for child page checking) ---

export async function getParentId(
  pageId: string
): Promise<{ id: string; type: "page" | "database" | "workspace" } | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const parent = (page as PageObjectResponse).parent;

    if (parent.type === "page_id") {
      return { id: parent.page_id, type: "page" };
    }
    if (parent.type === "database_id") {
      return { id: parent.database_id, type: "database" };
    }
    if (parent.type === "workspace") {
      return { id: "workspace", type: "workspace" };
    }
    return null;
  } catch {
    // Try as a database
    try {
      const db = await notion.databases.retrieve({ database_id: pageId });
      const parent = (db as DatabaseObjectResponse).parent;
      if (parent.type === "page_id") {
        return { id: parent.page_id, type: "page" };
      }
      if (parent.type === "database_id") {
        return { id: parent.database_id, type: "database" };
      }
      if (parent.type === "workspace") {
        return { id: "workspace", type: "workspace" };
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Extract title from a Notion page response.
 */
export function extractPageTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find(
    (prop) => prop.type === "title"
  );
  if (titleProp && titleProp.type === "title" && titleProp.title.length > 0) {
    return titleProp.title.map((t) => t.plain_text).join("");
  }
  return "Untitled";
}

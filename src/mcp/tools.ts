import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchNotion,
  getPage,
  getPageBlocks,
  getDatabase,
  queryDatabase,
  updatePageProperties,
  appendBlocks,
  createPage as notionCreatePage,
  addComment as notionAddComment,
  extractPageTitle,
} from "../notion/client.js";
import { checkPageAccess, filterApprovedResults } from "../notion/access.js";
import { blocksToMarkdown } from "../notion/blocks-to-markdown.js";
import { logAudit } from "../db/audit.js";
import { getUserById, User } from "../db/users.js";
import { extractNotionId, formatNotionId } from "../utils/notion-url.js";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

/**
 * Resolve the acting user from session context.
 * The sessionId encodes the userId (set during transport creation).
 */
function getUser(sessionUserMap: Map<string, string>, sessionId?: string): User | null {
  if (!sessionId) return null;
  const userId = sessionUserMap.get(sessionId);
  if (!userId) return null;
  return getUserById(userId) ?? null;
}

function formatDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Format page properties for display.
 */
function formatProperties(page: PageObjectResponse): string {
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(page.properties)) {
    let value = "";
    switch (prop.type) {
      case "title":
        value = prop.title.map((t) => t.plain_text).join("");
        break;
      case "rich_text":
        value = prop.rich_text.map((t) => t.plain_text).join("");
        break;
      case "number":
        value = prop.number?.toString() ?? "";
        break;
      case "select":
        value = prop.select?.name ?? "";
        break;
      case "multi_select":
        value = prop.multi_select.map((s) => s.name).join(", ");
        break;
      case "date":
        value = prop.date?.start ?? "";
        if (prop.date?.end) value += ` → ${prop.date.end}`;
        break;
      case "checkbox":
        value = prop.checkbox ? "Yes" : "No";
        break;
      case "url":
        value = prop.url ?? "";
        break;
      case "email":
        value = prop.email ?? "";
        break;
      case "phone_number":
        value = prop.phone_number ?? "";
        break;
      case "status":
        value = prop.status?.name ?? "";
        break;
      default:
        value = `[${prop.type}]`;
    }
    if (value) {
      lines.push(`**${key}:** ${value}`);
    }
  }
  return lines.join("\n");
}

export function registerTools(
  server: McpServer,
  sessionUserMap: Map<string, string>
): void {
  // --- search ---
  server.registerTool(
    "search",
    {
      title: "Search Notion",
      description:
        "Search across approved Notion pages. Returns page titles, IDs, and snippets for pages you have access to.",
      inputSchema: {
        query: z.string().describe("Search term"),
      },
    },
    async ({ query }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const results = await searchNotion(query);
      const allowedIds = new Set(
        await filterApprovedResults(
          results.results.map((r) => ({ id: r.id }))
        )
      );

      const filtered = results.results.filter((r) => allowedIds.has(r.id));

      logAudit(user.id, user.name, "search", undefined, { query, resultCount: filtered.length });

      if (filtered.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}" in approved pages.`,
            },
          ],
        };
      }

      const output = filtered
        .map((r) => {
          if (r.object === "page") {
            const page = r as PageObjectResponse;
            const title = extractPageTitle(page);
            return `- **${title}** (ID: ${r.id})`;
          }
          return `- ${r.object}: ${r.id}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${filtered.length} result(s) for "${query}":\n\n${output}`,
          },
        ],
      };
    }
  );

  // --- read_page ---
  server.registerTool(
    "read_page",
    {
      title: "Read Notion Page",
      description:
        "Fetch the content of a Notion page as markdown. Provide either a Notion page URL or page ID.",
      inputSchema: {
        page_id: z
          .string()
          .describe("Notion page URL or page ID"),
      },
    },
    async ({ page_id }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const access = await checkPageAccess(page_id);
      if (!access.allowed) {
        return {
          content: [{ type: "text", text: `Access denied: ${access.reason}` }],
          isError: true,
        };
      }

      const page = await getPage(access.notionPageId);
      const blocks = await getPageBlocks(access.notionPageId);
      const title = extractPageTitle(page);
      const markdown = blocksToMarkdown(blocks);
      const properties = formatProperties(page);

      logAudit(user.id, user.name, "read_page", access.notionPageId, { title });

      let output = `# ${title}\n\n`;
      if (properties) {
        output += `## Properties\n${properties}\n\n`;
      }
      output += `## Content\n${markdown}`;

      return {
        content: [{ type: "text", text: output }],
      };
    }
  );

  // --- read_database ---
  server.registerTool(
    "read_database",
    {
      title: "Read Notion Database",
      description:
        "Query a Notion database. Returns entries matching an optional filter/sort. Provide either a Notion database URL or database ID.",
      inputSchema: {
        database_id: z
          .string()
          .describe("Notion database URL or database ID"),
        filter: z
          .string()
          .optional()
          .describe(
            "Optional Notion database filter as a JSON string. See Notion API docs for filter format."
          ),
        sort: z
          .string()
          .optional()
          .describe(
            "Optional Notion database sort as a JSON string. See Notion API docs for sort format."
          ),
      },
    },
    async ({ database_id, filter, sort }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const access = await checkPageAccess(database_id);
      if (!access.allowed) {
        return {
          content: [{ type: "text", text: `Access denied: ${access.reason}` }],
          isError: true,
        };
      }

      const parsedFilter = filter ? JSON.parse(filter) : undefined;
      const parsedSort = sort ? JSON.parse(sort) : undefined;

      const dbInfo = await getDatabase(access.notionPageId);
      const results = await queryDatabase(access.notionPageId, parsedFilter, parsedSort);

      logAudit(user.id, user.name, "read_database", access.notionPageId, {
        title: dbInfo.title?.[0]?.plain_text ?? "Untitled",
        resultCount: results.length,
      });

      const entries = results.map((page) => {
        const title = extractPageTitle(page);
        const props = formatProperties(page);
        return `### ${title} (ID: ${page.id})\n${props}`;
      });

      const dbTitle = dbInfo.title?.[0]?.plain_text ?? "Untitled Database";

      return {
        content: [
          {
            type: "text",
            text: `# ${dbTitle}\n\n${results.length} entries found.\n\n${entries.join("\n\n---\n\n")}`,
          },
        ],
      };
    }
  );

  // --- update_page ---
  server.registerTool(
    "update_page",
    {
      title: "Update Notion Page",
      description:
        "Update properties of a Notion page and/or append content blocks. Requires write access to the page.",
      inputSchema: {
        page_id: z
          .string()
          .describe("Notion page URL or page ID"),
        properties: z
          .string()
          .optional()
          .describe(
            "Page properties to update as a JSON string. See Notion API docs for property format."
          ),
        content: z
          .string()
          .optional()
          .describe(
            "Blocks to append to the page as a JSON array string. See Notion API docs for block format."
          ),
      },
    },
    async ({ page_id, properties, content }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const access = await checkPageAccess(page_id, true);
      if (!access.allowed) {
        return {
          content: [{ type: "text", text: `Access denied: ${access.reason}` }],
          isError: true,
        };
      }

      if (!properties && !content) {
        return {
          content: [
            {
              type: "text",
              text: "Error: At least one of 'properties' or 'content' must be provided.",
            },
          ],
          isError: true,
        };
      }

      if (properties) {
        const parsedProperties = JSON.parse(properties);
        await updatePageProperties(access.notionPageId, parsedProperties);
      }

      if (content) {
        const parsedContent = JSON.parse(content);
        await appendBlocks(access.notionPageId, parsedContent);
      }

      // Add attribution comment
      await notionAddComment(
        access.notionPageId,
        `Updated by ${user.name} via Claude on ${formatDate()}`
      );

      logAudit(user.id, user.name, "update_page", access.notionPageId, {
        hasProperties: !!properties,
        hasContent: !!content,
      });

      return {
        content: [
          {
            type: "text",
            text: `Page updated successfully. Attribution comment added.`,
          },
        ],
      };
    }
  );

  // --- create_page ---
  server.registerTool(
    "create_page",
    {
      title: "Create Notion Page",
      description:
        "Create a new page as a child of an approved page or database entry. Requires write access to the parent.",
      inputSchema: {
        parent_id: z
          .string()
          .describe("Parent page or database URL/ID"),
        title: z.string().describe("Title for the new page"),
        properties: z
          .string()
          .optional()
          .describe(
            "Page properties as a JSON string (for database entries). See Notion API docs."
          ),
        content: z
          .string()
          .optional()
          .describe(
            "Page content blocks as a JSON array string. See Notion API docs."
          ),
      },
    },
    async ({ parent_id, title, properties, content }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const access = await checkPageAccess(parent_id, true);
      if (!access.allowed) {
        return {
          content: [{ type: "text", text: `Access denied: ${access.reason}` }],
          isError: true,
        };
      }

      // Determine if the parent is a database or a page
      let parentType: "page" | "database" = "page";
      try {
        await getDatabase(access.notionPageId);
        parentType = "database";
      } catch {
        parentType = "page";
      }

      const parsedProperties = properties ? JSON.parse(properties) : undefined;
      const parsedContent = content ? JSON.parse(content) : undefined;

      const newPage = await notionCreatePage({
        parentId: access.notionPageId,
        parentType,
        title,
        properties: parsedProperties,
        children: parsedContent,
      });

      // Add attribution comment
      await notionAddComment(
        newPage.id,
        `Created by ${user.name} via Claude on ${formatDate()}`
      );

      logAudit(user.id, user.name, "create_page", newPage.id, {
        parentId: access.notionPageId,
        title,
      });

      return {
        content: [
          {
            type: "text",
            text: `Page "${title}" created successfully (ID: ${newPage.id}). Attribution comment added.`,
          },
        ],
      };
    }
  );

  // --- add_comment ---
  server.registerTool(
    "add_comment",
    {
      title: "Add Notion Comment",
      description:
        "Add a comment to a Notion page. The comment will be prefixed with your name for attribution.",
      inputSchema: {
        page_id: z
          .string()
          .describe("Notion page URL or page ID"),
        comment: z.string().describe("Comment text to add"),
      },
    },
    async ({ page_id, comment }, extra) => {
      const user = getUser(sessionUserMap, extra.sessionId);
      if (!user) {
        return {
          content: [{ type: "text", text: "Error: Not authenticated." }],
          isError: true,
        };
      }

      const access = await checkPageAccess(page_id);
      if (!access.allowed) {
        return {
          content: [{ type: "text", text: `Access denied: ${access.reason}` }],
          isError: true,
        };
      }

      await notionAddComment(access.notionPageId, `${user.name}: ${comment}`);

      logAudit(user.id, user.name, "add_comment", access.notionPageId, {
        commentLength: comment.length,
      });

      return {
        content: [
          {
            type: "text",
            text: `Comment added successfully to the page.`,
          },
        ],
      };
    }
  );
}

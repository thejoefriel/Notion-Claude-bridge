/**
 * Extract a Notion page or database ID from various URL formats or raw IDs.
 *
 * Accepted formats:
 * - Raw 32-char hex ID: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 * - Dashed UUID: "a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4"
 * - Notion URL: "https://www.notion.so/workspace/Page-Title-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 * - Notion URL with query: "https://notion.so/workspace/abc123?v=..."
 * - Notion database URL: "https://www.notion.so/workspace/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4?v=..."
 */
export function extractNotionId(input: string): string | null {
  // Strip whitespace
  const trimmed = input.trim();

  // Already a dashed UUID
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    return trimmed.replace(/-/g, "");
  }

  // Raw 32-char hex
  const rawIdRegex = /^[a-f0-9]{32}$/i;
  if (rawIdRegex.test(trimmed)) {
    return trimmed;
  }

  // Notion URL - extract the last 32 hex chars before any query string
  const urlRegex = /([a-f0-9]{32})(?:\?|$)/i;
  const match = trimmed.match(urlRegex);
  if (match) {
    return match[1];
  }

  // Try extracting from slug format: "Page-Title-<id>"
  const slugRegex = /([a-f0-9]{32})$/i;
  const slugMatch = trimmed.replace(/\?.*$/, "").match(slugRegex);
  if (slugMatch) {
    return slugMatch[1];
  }

  return null;
}

/**
 * Format a raw 32-char hex ID as a dashed UUID for use with the Notion API.
 */
export function formatNotionId(rawId: string): string {
  const clean = rawId.replace(/-/g, "");
  return [
    clean.slice(0, 8),
    clean.slice(8, 12),
    clean.slice(12, 16),
    clean.slice(16, 20),
    clean.slice(20, 32),
  ].join("-");
}

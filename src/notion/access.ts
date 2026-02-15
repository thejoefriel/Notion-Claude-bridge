import { getApprovedPageByNotionId, getAllApprovedNotionIds } from "../db/approved-pages.js";
import { getParentId } from "./client.js";
import { extractNotionId, formatNotionId } from "../utils/notion-url.js";

/**
 * Maximum depth to walk up the parent chain when checking if a page
 * is a descendant of an approved page.
 */
const MAX_PARENT_DEPTH = 10;

export interface AccessCheckResult {
  allowed: boolean;
  accessLevel?: "read-write" | "read-only";
  notionPageId: string;
  reason?: string;
}

/**
 * Check if a page (by URL or ID) is accessible.
 * A page is accessible if it is in the approved pages list,
 * or if one of its ancestor pages is in the approved list.
 */
export async function checkPageAccess(
  pageUrlOrId: string,
  requireWriteAccess: boolean = false
): Promise<AccessCheckResult> {
  const rawId = extractNotionId(pageUrlOrId);
  if (!rawId) {
    return {
      allowed: false,
      notionPageId: pageUrlOrId,
      reason: "Could not extract a valid Notion page ID from the provided input.",
    };
  }

  const notionId = formatNotionId(rawId);

  // Check if this exact page is approved
  const directMatch = getApprovedPageByNotionId(rawId);
  if (directMatch) {
    if (requireWriteAccess && directMatch.access_level === "read-only") {
      return {
        allowed: false,
        notionPageId: notionId,
        reason: "This page is read-only. Write access is not permitted.",
      };
    }
    return {
      allowed: true,
      accessLevel: directMatch.access_level,
      notionPageId: notionId,
    };
  }

  // Walk up the parent chain to check if any ancestor is approved
  const approvedIds = new Set(getAllApprovedNotionIds());
  let currentId = notionId;

  for (let depth = 0; depth < MAX_PARENT_DEPTH; depth++) {
    const parent = await getParentId(currentId);
    if (!parent || parent.type === "workspace") break;

    const parentRawId = parent.id.replace(/-/g, "");

    if (approvedIds.has(parentRawId)) {
      const approvedPage = getApprovedPageByNotionId(parentRawId)!;
      if (requireWriteAccess && approvedPage.access_level === "read-only") {
        return {
          allowed: false,
          notionPageId: notionId,
          reason:
            "The parent page of this resource is read-only. Write access is not permitted.",
        };
      }
      return {
        allowed: true,
        accessLevel: approvedPage.access_level,
        notionPageId: notionId,
      };
    }

    currentId = parent.id;
  }

  return {
    allowed: false,
    notionPageId: notionId,
    reason: "This page is not in the list of approved pages, nor is it a child of an approved page.",
  };
}

/**
 * Filter search results to only include pages that are approved
 * or are children of approved pages. This uses the parent chain check
 * for each result, so it may make multiple API calls for non-approved pages.
 */
export async function filterApprovedResults(
  results: Array<{ id: string; [key: string]: unknown }>
): Promise<string[]> {
  const approvedIds = new Set(getAllApprovedNotionIds());
  const allowedIds: string[] = [];

  for (const result of results) {
    const rawId = result.id.replace(/-/g, "");

    // Quick check: is this directly approved?
    if (approvedIds.has(rawId)) {
      allowedIds.push(result.id);
      continue;
    }

    // Slower check: walk up parent chain
    const access = await checkPageAccess(result.id);
    if (access.allowed) {
      allowedIds.push(result.id);
    }
  }

  return allowedIds;
}

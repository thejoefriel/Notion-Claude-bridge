import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints.js";

/**
 * Convert Notion rich text to plain markdown string.
 */
function richTextToMarkdown(richText: RichTextItemResponse[]): string {
  return richText
    .map((item) => {
      let text = item.plain_text;
      if (item.annotations.bold) text = `**${text}**`;
      if (item.annotations.italic) text = `*${text}*`;
      if (item.annotations.strikethrough) text = `~~${text}~~`;
      if (item.annotations.code) text = `\`${text}\``;
      if (item.href) text = `[${text}](${item.href})`;
      return text;
    })
    .join("");
}

/**
 * Convert an array of Notion blocks into a markdown string.
 */
export function blocksToMarkdown(
  blocks: (BlockObjectResponse | PartialBlockObjectResponse)[]
): string {
  const lines: string[] = [];

  for (const block of blocks) {
    if (!("type" in block)) continue;
    const b = block as BlockObjectResponse;

    switch (b.type) {
      case "paragraph":
        lines.push(richTextToMarkdown(b.paragraph.rich_text));
        lines.push("");
        break;

      case "heading_1":
        lines.push(`# ${richTextToMarkdown(b.heading_1.rich_text)}`);
        lines.push("");
        break;

      case "heading_2":
        lines.push(`## ${richTextToMarkdown(b.heading_2.rich_text)}`);
        lines.push("");
        break;

      case "heading_3":
        lines.push(`### ${richTextToMarkdown(b.heading_3.rich_text)}`);
        lines.push("");
        break;

      case "bulleted_list_item":
        lines.push(`- ${richTextToMarkdown(b.bulleted_list_item.rich_text)}`);
        break;

      case "numbered_list_item":
        lines.push(`1. ${richTextToMarkdown(b.numbered_list_item.rich_text)}`);
        break;

      case "to_do":
        const checked = b.to_do.checked ? "x" : " ";
        lines.push(`- [${checked}] ${richTextToMarkdown(b.to_do.rich_text)}`);
        break;

      case "toggle":
        lines.push(`<details><summary>${richTextToMarkdown(b.toggle.rich_text)}</summary>`);
        lines.push("</details>");
        lines.push("");
        break;

      case "quote":
        lines.push(`> ${richTextToMarkdown(b.quote.rich_text)}`);
        lines.push("");
        break;

      case "callout":
        lines.push(`> ${richTextToMarkdown(b.callout.rich_text)}`);
        lines.push("");
        break;

      case "code":
        const lang = b.code.language || "";
        lines.push(`\`\`\`${lang}`);
        lines.push(richTextToMarkdown(b.code.rich_text));
        lines.push("```");
        lines.push("");
        break;

      case "divider":
        lines.push("---");
        lines.push("");
        break;

      case "table_of_contents":
        lines.push("[Table of Contents]");
        lines.push("");
        break;

      case "image":
        if (b.image.type === "external") {
          lines.push(`![image](${b.image.external.url})`);
        } else if (b.image.type === "file") {
          lines.push(`![image](${b.image.file.url})`);
        }
        lines.push("");
        break;

      case "bookmark":
        lines.push(`[Bookmark: ${b.bookmark.url}](${b.bookmark.url})`);
        lines.push("");
        break;

      case "link_preview":
        lines.push(`[Link: ${b.link_preview.url}](${b.link_preview.url})`);
        lines.push("");
        break;

      case "child_page":
        lines.push(`📄 **${b.child_page.title}** (child page)`);
        lines.push("");
        break;

      case "child_database":
        lines.push(`📊 **${b.child_database.title}** (child database)`);
        lines.push("");
        break;

      default:
        lines.push(`[Unsupported block type: ${b.type}]`);
        lines.push("");
    }
  }

  return lines.join("\n").trim();
}

import { marked, type Tokens } from "marked";

// Minimal document IR shared by the PDF and DOCX renderers, so both stay in sync with
// exactly one Markdown parse. Only the subset of Markdown the CV/cover-letter prompts
// actually produce (headings, paragraphs, bullet lists, bold/italic inline) is modeled —
// anything else collapses to plain text rather than failing the export.
export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "heading"; depth: 1 | 2 | 3; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "bullets"; items: Run[][] };

function inlineRuns(tokens: unknown[]): Run[] {
  const runs: Run[] = [];
  const walk = (toks: unknown[], bold = false, italic = false) => {
    for (const t of toks as Array<{ type: string; text?: string; tokens?: unknown[]; raw?: string }>) {
      if (t.type === "strong") walk(t.tokens ?? [], true, italic);
      else if (t.type === "em") walk(t.tokens ?? [], bold, true);
      // List-item text tokens can wrap their own inline tokens (bold/italic/etc) in a
      // nested `tokens` array — descend into those first, or nested emphasis renders as
      // literal asterisks instead of being parsed.
      else if ((t.type === "text" || t.type === "paragraph") && t.tokens) {
        walk(t.tokens, bold, italic);
      } else if (t.type === "text" || t.type === "codespan" || t.type === "link") {
        runs.push({ text: t.text ?? t.raw ?? "", bold, italic });
      } else if (t.tokens) {
        walk(t.tokens, bold, italic);
      } else if (t.raw) {
        runs.push({ text: t.raw, bold, italic });
      }
    }
  };
  walk(tokens as unknown[]);
  return runs.length ? runs : [];
}

export function markdownToBlocks(md: string): Block[] {
  const tokens = marked.lexer(md);
  const blocks: Block[] = [];

  for (const token of tokens) {
    if (token.type === "heading") {
      const depth = Math.min(token.depth, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", depth, runs: inlineRuns(token.tokens ?? []) });
    } else if (token.type === "paragraph") {
      const runs = inlineRuns(token.tokens ?? []);
      if (runs.length) blocks.push({ type: "paragraph", runs });
    } else if (token.type === "list") {
      const items = (token as Tokens.List).items.map((item: Tokens.ListItem) =>
        inlineRuns(item.tokens ?? [{ type: "text", text: item.text, raw: item.text }])
      );
      if (items.length) blocks.push({ type: "bullets", items });
    } else if (token.type === "space" || token.type === "hr") {
      // no-op — pure spacing tokens
    } else if ("text" in token && token.text) {
      // Fallback: unmodeled token types (blockquote, code, table, …) render as plain text
      // rather than being dropped, so nothing the model writes silently disappears.
      blocks.push({ type: "paragraph", runs: [{ text: token.text }] });
    }
  }

  return blocks;
}

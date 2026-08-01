import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageOrientation,
  convertInchesToTwip,
} from "docx";
import { markdownToBlocks, type Block, type Run } from "./markdownToBlocks";
import { pageSizeFor } from "@/data/countryRules";

// docx page-size constants aren't exported as named sizes — Letter/A4 in twips (1/20 pt).
const PAGE_DIMENSIONS = {
  LETTER: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
  A4: { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) },
} as const;

function toTextRuns(runs: Run[]): TextRun[] {
  return runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic }));
}

const HEADING_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

function blockToParagraphs(block: Block): Paragraph[] {
  if (block.type === "heading") {
    return [
      new Paragraph({
        heading: HEADING_LEVEL[block.depth],
        spacing: { before: 200, after: 120 },
        children: toTextRuns(block.runs),
      }),
    ];
  }
  if (block.type === "paragraph") {
    return [new Paragraph({ spacing: { after: 120 }, children: toTextRuns(block.runs) })];
  }
  // bullets
  return block.items.map(
    (runs) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: toTextRuns(runs),
      })
  );
}

/**
 * Render Markdown into a formatted DOCX buffer. Page size follows the target country's
 * paper stock convention (Letter for US/CA, A4 elsewhere); margins are a standard
 * 1-inch document margin, kept constant across countries per the CV writer prompt's
 * own layout norms (page count, headshot, etc.) rather than duplicating that logic here.
 */
export async function markdownToDocx(md: string, country: string): Promise<Buffer> {
  const blocks = markdownToBlocks(md);
  const size = PAGE_DIMENSIONS[pageSizeFor(country)];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { ...size, orientation: PageOrientation.PORTRAIT },
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: blocks.flatMap(blockToParagraphs),
      },
    ],
  });

  return Packer.toBuffer(doc);
}

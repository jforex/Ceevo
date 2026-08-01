import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { markdownToBlocks, type Block, type Run } from "./markdownToBlocks";
import { pageSizeFor } from "@/data/countryRules";

// react-pdf's default font (Helvetica) has no bold/italic metrics registered by default
// for arbitrary Unicode, but does support bold/italic variants of the base 14 PDF fonts
// out of the box via fontWeight/fontStyle — no external font file needed here.
Font.registerHyphenationCallback((word) => [word]); // disable automatic hyphenation

const styles = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 54, paddingHorizontal: 54, fontSize: 10.5, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  paragraph: { marginBottom: 6, lineHeight: 1.4 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletMark: { width: 12, lineHeight: 1.4 },
  bulletText: { flex: 1, lineHeight: 1.4 },
});

function fontFor(r: Run): string {
  if (r.bold && r.italic) return "Helvetica-BoldOblique";
  if (r.bold) return "Helvetica-Bold";
  if (r.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text key={i} style={{ fontFamily: fontFor(r) }}>
          {r.text}
        </Text>
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "heading") {
    const style = block.depth === 1 ? styles.h1 : block.depth === 2 ? styles.h2 : styles.h3;
    return (
      <Text style={style}>
        <Runs runs={block.runs} />
      </Text>
    );
  }
  if (block.type === "paragraph") {
    return (
      <Text style={styles.paragraph}>
        <Runs runs={block.runs} />
      </Text>
    );
  }
  // bullets
  return (
    <View>
      {block.items.map((runs, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>{"•"}</Text>
          <Text style={styles.bulletText}>
            <Runs runs={runs} />
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Render Markdown into a formatted PDF buffer. Page size follows the target country's
 * paper stock convention (Letter for US/CA, A4 elsewhere), matching exportDocx.
 */
export async function markdownToPdf(md: string, country: string): Promise<Buffer> {
  const blocks = markdownToBlocks(md);
  const size = pageSizeFor(country) === "LETTER" ? "LETTER" : "A4";

  const doc = (
    <Document>
      <Page size={size} style={styles.page}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

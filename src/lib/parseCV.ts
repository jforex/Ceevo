import mammoth from "mammoth";

// Extract plain text from an uploaded CV file (PDF or DOCX).
// Takes a Buffer + the file's mime type or name.
export async function parseCV(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // pdf-parse is CommonJS; import inside the function to avoid bundling issues.
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return clean(data.text);
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return clean(result.value);
  }

  if (lower.endsWith(".txt")) {
    return clean(buffer.toString("utf-8"));
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT.");
}

function clean(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
    .trim();
}
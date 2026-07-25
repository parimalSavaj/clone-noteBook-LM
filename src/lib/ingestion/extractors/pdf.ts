/**
 * PDF extractor.
 * Primary: pdf-parse (fast, simple text extraction)
 * Fallback: pdfjs-dist (complex layouts, multi-column)
 *
 * TODO: Install pdf-parse and implement in Phase 4
 */
export async function extractPdf(_buffer: Buffer): Promise<string> {
  throw new Error("PDF extraction not yet implemented — Phase 4");
}

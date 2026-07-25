/**
 * PDF extractor.
 * Uses pdf-parse v2 (class-based API with PDFParse).
 */
import { PDFParse } from "pdf-parse";

export interface PdfPage {
  text: string;
  pageNumber: number;
}

/**
 * Extract text content from a PDF buffer.
 *
 * Returns the full concatenated text. For per-page chunking,
 * use extractPdfPages() which returns text split by page.
 */
export async function extractPdf(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse({ data: uint8, verbosity: 0 });
  const result = await parser.getText();
  const text = result.text?.trim() || "";

  if (text.length < 100) {
    throw new Error(
      "PDF extraction returned insufficient text. The PDF may be scanned/image-based.",
    );
  }

  return text;
}

/**
 * Extract text per page from a PDF buffer.
 * Each page is returned as a separate entry with its page number.
 * Used by the worker to produce chunks with pageNumber metadata.
 */
export async function extractPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse({ data: uint8, verbosity: 0 });
  const result = await parser.getText();

  const pages: PdfPage[] = [];

  if (result.pages && result.pages.length > 0) {
    for (let i = 0; i < result.pages.length; i++) {
      const text = result.pages[i].text?.trim() || "";
      if (text.length > 0) {
        pages.push({ text, pageNumber: i + 1 });
      }
    }
  }

  // Fallback: if pages array didn't work, use full text as single page
  if (pages.length === 0) {
    const fullText = result.text?.trim() || "";
    if (fullText.length > 0) {
      pages.push({ text: fullText, pageNumber: 1 });
    }
  }

  return pages;
}

/**
 * Token-aware recursive chunking.
 *
 * Strategy: two-stage pipeline
 *   1. Structure-aware pre-split (caller's responsibility — pass sections/pages/time-windows)
 *   2. Recursive token-split within each structural unit (this module)
 *
 * See docs/CHUNKING_STRATEGY.md for full reasoning.
 *
 * Dependencies: @langchain/textsplitters, js-tiktoken
 * Install: npm install @langchain/textsplitters js-tiktoken
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";

export interface ChunkResult {
  content: string;
  /** 0-based position within the parent document — enables neighbor retrieval */
  sequenceIndex: number;
  /** Source-specific metadata (page number, timestamps, heading path, etc.) */
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHUNK_SIZE = 400; // tokens
const DEFAULT_CHUNK_OVERLAP = 60; // tokens (~15%)

/**
 * Lazily create and cache the tiktoken encoder.
 * text-embedding-3-small uses the cl100k_base encoding (same as GPT-4 / text-embedding-ada-002).
 */
let _enc: ReturnType<typeof encodingForModel> | null = null;
function getEncoder() {
  if (!_enc) {
    _enc = encodingForModel("text-embedding-3-small");
  }
  return _enc;
}

function tokenLength(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Split a plain text string into token-bounded chunks with overlap.
 *
 * @param text      Raw text content (already extracted from the source)
 * @param metadata  Base metadata to attach to every chunk (e.g. { pageNumber: 3 })
 * @param options   Override default chunk size / overlap
 * @param sequenceOffset  Starting value for sequenceIndex (use when splitting multiple sections)
 */
export async function chunkText(
  text: string,
  metadata?: Record<string, unknown>,
  options?: { chunkSize?: number; chunkOverlap?: number },
  sequenceOffset = 0,
): Promise<ChunkResult[]> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    lengthFunction: tokenLength,
    // Separators ordered from coarsest to finest — paragraph → sentence → word → char
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const docs = await splitter.createDocuments([text]);

  return docs.map((doc, i) => ({
    content: doc.pageContent.trim(),
    sequenceIndex: sequenceOffset + i,
    metadata: metadata ? { ...metadata } : undefined,
  }));
}

/**
 * Split multiple pre-split sections (e.g. pages, headings, time-windows) into chunks,
 * preserving per-section metadata and producing a flat, sequentially-indexed result.
 *
 * Each section can carry its own metadata (pageNumber, headingPath, startMs, etc.)
 * which is merged into every chunk produced from that section.
 *
 * @example
 *   // PDF with page boundaries
 *   await chunkSections([
 *     { text: "...", metadata: { pageNumber: 1 } },
 *     { text: "...", metadata: { pageNumber: 2 } },
 *   ]);
 */
export async function chunkSections(
  sections: Array<{ text: string; metadata?: Record<string, unknown> }>,
  options?: { chunkSize?: number; chunkOverlap?: number },
): Promise<ChunkResult[]> {
  const results: ChunkResult[] = [];

  for (const section of sections) {
    const chunks = await chunkText(
      section.text,
      section.metadata,
      options,
      results.length, // sequenceOffset keeps indices contiguous across sections
    );
    results.push(...chunks);
  }

  return results;
}

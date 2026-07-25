/**
 * Fixed-size chunking with overlap.
 *
 * Strategy baseline (Phase 2/3):
 * - Chunk size: ~2400 characters (~600 tokens)
 * - Overlap: 15% (~360 characters)
 *
 * See CHUNKING_STRATEGY.md for reasoning.
 */

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHUNK_SIZE = 2400; // characters (~600 tokens)
const DEFAULT_OVERLAP = 360; // characters (~15%)

export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): ChunkResult[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: ChunkResult[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf("\n\n", end);
      const lastSentence = text.lastIndexOf(". ", end);
      const lastNewline = text.lastIndexOf("\n", end);

      if (lastParagraph > start + chunkSize * 0.5) {
        end = lastParagraph + 2;
      } else if (lastSentence > start + chunkSize * 0.5) {
        end = lastSentence + 2;
      } else if (lastNewline > start + chunkSize * 0.5) {
        end = lastNewline + 1;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ content, chunkIndex });
      chunkIndex++;
    }

    // Move start forward by (end - overlap) to create overlap
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

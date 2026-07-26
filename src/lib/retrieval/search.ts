import postgres from "postgres";
import { embedText } from "./embed";

export interface SearchResult {
  id: string;
  sourceId: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

/**
 * Perform vector similarity search scoped to a specific notebook.
 * Uses cosine similarity via pgvector's <=> operator.
 * Results below minSimilarity are filtered out.
 */
export async function vectorSearch(
  query: string,
  notebookId: string,
  topK: number = 5,
  minSimilarity: number = 0.3,
): Promise<SearchResult[]> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    const queryEmbedding = await embedText(query);

    const results = await sql`
      SELECT
        id,
        source_id    AS "sourceId",
        content,
        chunk_index  AS "chunkIndex",
        metadata,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
      FROM chunks
      WHERE notebook_id = ${notebookId}
        AND 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${minSimilarity}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `;

    return results as unknown as SearchResult[];
  } finally {
    await sql.end();
  }
}

/**
 * Full-text keyword search using Postgres tsvector/tsquery.
 * Finds exact keyword matches that vector search might miss.
 */
export async function keywordSearch(
  query: string,
  notebookId: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    const results = await sql`
      SELECT
        id,
        source_id AS "sourceId",
        content,
        chunk_index AS "chunkIndex",
        metadata,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) AS similarity
      FROM chunks
      WHERE notebook_id = ${notebookId}
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) DESC
      LIMIT ${topK}
    `;

    return results as unknown as SearchResult[];
  } finally {
    await sql.end();
  }
}

/**
 * Hybrid search combining vector similarity and keyword search using
 * Reciprocal Rank Fusion (RRF) to merge ranked result lists.
 *
 * RRF formula: score = 1/(k + rank_vector) + 1/(k + rank_keyword)
 * where k=60 is the standard constant.
 */
export async function hybridSearch(
  query: string,
  notebookId: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const K = 60; // Standard RRF constant

  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(query, notebookId, topK * 2, 0.2), // Fetch more, lower threshold for RRF
    keywordSearch(query, notebookId, topK * 2),
  ]);

  // Build a combined map by chunk ID
  const combined = new Map<
    string,
    { result: SearchResult; rrfScore: number }
  >();

  // Assign RRF scores from vector results (rank 1 = best)
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (K + rank);
    combined.set(result.id, { result, rrfScore });
  });

  // Add RRF scores from keyword results
  keywordResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (K + rank);

    const existing = combined.get(result.id);
    if (existing) {
      // Chunk appears in both lists — sum RRF scores
      existing.rrfScore += rrfScore;
    } else {
      combined.set(result.id, { result, rrfScore });
    }
  });

  // Sort by combined RRF score descending, take top-K
  const sorted = [...combined.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);

  // Return results with similarity set to the RRF score
  return sorted.map(({ result, rrfScore }) => ({
    ...result,
    similarity: rrfScore,
  }));
}

/**
 * Expand retrieved chunks with their immediate neighbours (chunk N-1 and N+1)
 * to give the LLM more context around retrieved passages.
 *
 * Only expands the top-N chunks (default 3) to avoid blowing up context.
 * Skips neighbours that are already in the retrieved set.
 */
export async function expandWithNeighbours(
  results: SearchResult[],
  expandCount: number = 3,
): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Only expand the top N results
    const toExpand = results.slice(0, expandCount);
    const existingIds = new Set(results.map((r) => r.id));

    // Fetch neighbours for each chunk to expand
    const neighbourPromises = toExpand.map(async (chunk) => {
      const neighbours = await sql`
        SELECT id, source_id AS "sourceId", content, chunk_index AS "chunkIndex", metadata
        FROM chunks
        WHERE source_id = ${chunk.sourceId}
          AND chunk_index IN (${chunk.chunkIndex - 1}, ${chunk.chunkIndex + 1})
        ORDER BY chunk_index ASC
      `;
      return { chunk, neighbours: neighbours as unknown as SearchResult[] };
    });

    const expansions = await Promise.all(neighbourPromises);

    // Build expanded results
    const expandedResults = results.map((result) => {
      const expansion = expansions.find((e) => e.chunk.id === result.id);
      if (!expansion) return result;

      const before = expansion.neighbours.find(
        (n) => n.chunkIndex === result.chunkIndex - 1 && !existingIds.has(n.id),
      );
      const after = expansion.neighbours.find(
        (n) => n.chunkIndex === result.chunkIndex + 1 && !existingIds.has(n.id),
      );

      // Merge neighbour content seamlessly
      let expandedContent = "";
      if (before) {
        expandedContent += `${before.content}\n\n`;
      }
      expandedContent += result.content;
      if (after) {
        expandedContent += `\n\n${after.content}`;
      }

      return { ...result, content: expandedContent };
    });

    return expandedResults;
  } finally {
    await sql.end();
  }
}

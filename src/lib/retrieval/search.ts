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

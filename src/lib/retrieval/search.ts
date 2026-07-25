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
 * Perform vector similarity search scoped to a specific notebook and user.
 * Uses cosine similarity via pgvector's <=> operator.
 */
export async function vectorSearch(
  query: string,
  notebookId: string,
  userId: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // 1. Embed the query
    const queryEmbedding = await embedText(query);

    // 2. Search using cosine similarity, scoped by notebook AND user
    const results = await sql`
      SELECT
        id,
        source_id as "sourceId",
        content,
        chunk_index as "chunkIndex",
        metadata,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM chunks
      WHERE notebook_id = ${notebookId}
        AND user_id = ${userId}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `;

    return results as unknown as SearchResult[];
  } finally {
    await sql.end();
  }
}

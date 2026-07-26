import { hybridSearch, expandWithNeighbours } from "@/lib/retrieval/search";
import { generateAnswer, rewriteQuery } from "@/lib/retrieval/generate";
import postgres from "postgres";

/**
 * POST /api/query — ask a question against a notebook's knowledge base
 *
 * Body: { notebookId: string, question: string, history?: { role: string, content: string }[] }
 * Returns: streaming text response with inline citations
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { notebookId, question, history } = body;

  if (!notebookId || !question) {
    return Response.json(
      { error: "notebookId and question are required" },
      { status: 400 },
    );
  }

  // 1. Determine the search query — rewrite if multi-turn conversation
  let searchQuery = question;
  if (history && Array.isArray(history) && history.length > 2) {
    // More than 1 message pair (2 messages) — rewrite for context
    searchQuery = await rewriteQuery(question, history);
  }

  // 2. Retrieve relevant chunks using hybrid search (vector + keyword with RRF)
  const chunks = await hybridSearch(searchQuery, notebookId, 5);

  // 3. No relevant chunks — return a clear fallback message
  if (chunks.length === 0) {
    return Response.json({
      answer: "I couldn't find information about this in your sources.",
      citations: [],
    });
  }

  // 4. Expand top chunks with their neighbours for more context
  const expandedChunks = await expandWithNeighbours(chunks, 3);

  // 5. Build a sourceId → name map for the system prompt
  const sql = postgres(process.env.DATABASE_URL!);
  const uniqueSourceIds = [...new Set(expandedChunks.map((c) => c.sourceId))];
  let sourceNames = new Map<string, string>();
  try {
    const rows = await sql`
      SELECT id, name FROM sources WHERE id = ANY(${uniqueSourceIds})
    `;
    sourceNames = new Map(rows.map((r) => [r.id, r.name]));
  } finally {
    await sql.end();
  }

  // 6. Generate a streaming answer grounded in the retrieved chunks
  const stream = await generateAnswer(question, expandedChunks, sourceNames);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Access-Control-Expose-Headers": "X-Citations",
      "X-Citations": JSON.stringify(
        chunks.map((c) => ({
          id: c.id,
          sourceId: c.sourceId,
          chunkIndex: c.chunkIndex,
          metadata: c.metadata,
          similarity: c.similarity,
        })),
      ),
    },
  });
}

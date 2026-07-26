import { vectorSearch } from "@/lib/retrieval/search";
import { generateAnswer } from "@/lib/retrieval/generate";
import postgres from "postgres";

/**
 * POST /api/query — ask a question against a notebook's knowledge base
 *
 * Body: { notebookId: string, question: string }
 * Returns: streaming text response with inline citations
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { notebookId, question } = body;

  if (!notebookId || !question) {
    return Response.json(
      { error: "notebookId and question are required" },
      { status: 400 },
    );
  }

  // 1. Retrieve relevant chunks scoped to this notebook (with similarity threshold)
  const chunks = await vectorSearch(question, notebookId, 5, 0.3);

  // 2. No relevant chunks — return a clear fallback message
  if (chunks.length === 0) {
    return Response.json({
      answer: "I couldn't find information about this in your sources.",
      citations: [],
    });
  }

  // 3. Build a sourceId → name map for the system prompt
  const sql = postgres(process.env.DATABASE_URL!);
  const uniqueSourceIds = [...new Set(chunks.map((c) => c.sourceId))];
  let sourceNames = new Map<string, string>();
  try {
    const rows = await sql`
      SELECT id, name FROM sources WHERE id = ANY(${uniqueSourceIds})
    `;
    sourceNames = new Map(rows.map((r) => [r.id, r.name]));
  } finally {
    await sql.end();
  }

  // 4. Generate a streaming answer grounded in the retrieved chunks
  const stream = await generateAnswer(question, chunks, sourceNames);

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

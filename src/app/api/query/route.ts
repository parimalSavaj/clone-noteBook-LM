import { vectorSearch } from "@/lib/retrieval/search";
import { generateAnswer } from "@/lib/retrieval/generate";

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

  // 1. Retrieve relevant chunks scoped to this notebook
  const chunks = await vectorSearch(question, notebookId, 5);

  // 2. No relevant chunks — return a clear fallback message
  if (chunks.length === 0) {
    return Response.json({
      answer:
        "I couldn't find information about this in your sources. Try adding more sources to your notebook.",
      citations: [],
    });
  }

  // 3. Generate a streaming answer grounded in the retrieved chunks
  const stream = await generateAnswer(question, chunks);

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
        })),
      ),
    },
  });
}

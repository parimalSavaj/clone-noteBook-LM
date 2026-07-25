import OpenAI from "openai";
import type { SearchResult } from "./search";

function getClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

/**
 * Build the system prompt with retrieved context and citation instructions.
 */
function buildPrompt(chunks: SearchResult[]): string {
  const contextBlock = chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] (source: ${chunk.sourceId}, chunk: ${chunk.chunkIndex})\n${chunk.content}`,
    )
    .join("\n\n---\n\n");

  return `You are a research assistant. Answer the user's question using ONLY the provided sources below. 

Rules:
- Cite every claim using inline citations like [1], [2], etc.
- If the answer cannot be found in the sources, say "I couldn't find information about this in your sources."
- Never invent information that isn't in the sources.
- Be concise and direct.

Sources:
${contextBlock}`;
}

/**
 * Generate a grounded answer using retrieved chunks as context.
 * Returns a ReadableStream for streaming responses.
 */
export async function generateAnswer(
  question: string,
  chunks: SearchResult[],
): Promise<ReadableStream<Uint8Array>> {
  const model = process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini";

  const response = await getClient().chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: "system", content: buildPrompt(chunks) },
      { role: "user", content: question },
    ],
    temperature: 0.3,
  });

  // Convert the OpenAI stream to a web ReadableStream
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });
}

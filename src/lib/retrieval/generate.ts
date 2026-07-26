import OpenAI from "openai";
import type { SearchResult } from "./search";

function getClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

/**
 * Build the system prompt with retrieved context and strict citation instructions.
 * Accepts an optional sourceNames map (sourceId → display name) to show
 * human-readable names in the context block instead of raw UUIDs.
 */
function buildPrompt(
  chunks: SearchResult[],
  sourceNames?: Map<string, string>,
): string {
  const contextBlock = chunks
    .map((chunk, i) => {
      const name = sourceNames?.get(chunk.sourceId) ?? chunk.sourceId;
      return `[${i + 1}] (source: ${name}, chunk: ${chunk.chunkIndex})\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  return `You are a research assistant. Answer the user's question using ONLY the provided sources below.

Rules:
- Every sentence that contains a specific fact must end with a citation before the period, like [1] or [2].
- If a sentence draws from multiple sources, cite all of them: [1][2].
- Place citations inline with the specific claim — never group them at the end of a paragraph.
- Do not add a references section at the end — inline citations only.
- If you cannot cite a sentence from the provided sources, do not write it.
- Never invent information that is not in the sources.
- Use markdown formatting where appropriate (bold, bullet lists, numbered lists, code blocks).
- Be concise and direct.

If the answer is not in the sources, respond with exactly:
"I couldn't find information about this in your sources."
Do not add any other text.

Sources:
${contextBlock}`;
}

/**
 * Generate a grounded answer using retrieved chunks as context.
 * Returns a ReadableStream for streaming responses.
 *
 * @param question - The user's question
 * @param chunks - Retrieved search results
 * @param sourceNames - Optional map of sourceId → display name for context block
 */
export async function generateAnswer(
  question: string,
  chunks: SearchResult[],
  sourceNames?: Map<string, string>,
): Promise<ReadableStream<Uint8Array>> {
  const model = process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini";

  const response = await getClient().chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: "system", content: buildPrompt(chunks, sourceNames) },
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

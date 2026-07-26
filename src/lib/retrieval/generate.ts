import OpenAI from "openai";
import type { SearchResult } from "./search";

interface HistoryMessage {
  role: string;
  content: string;
}

function getClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

/**
 * Rewrite a follow-up question into a standalone search query using conversation history.
 * This improves retrieval for multi-turn conversations where follow-ups like
 * "What else did he say?" would otherwise match nothing in vector search.
 *
 * Uses a cheap, fast model (gpt-4o-mini) with temperature 0 for deterministic rewrites.
 */
export async function rewriteQuery(
  question: string,
  history: HistoryMessage[],
): Promise<string> {
  // Take the last 4 message pairs (8 messages) for context
  const recentHistory = history.slice(-8);

  const conversationBlock = recentHistory
    .map(
      (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
    )
    .join("\n");

  const systemPrompt = `Given this conversation history, rewrite the latest question as a standalone search query that contains all the context needed to retrieve relevant information, even without the conversation history.

Return ONLY the rewritten query — no explanation, no quotes, no prefix.`;

  const userPrompt = `Conversation:
${conversationBlock}

Latest question: ${question}

Standalone query:`;

  const model = process.env.OPENROUTER_REWRITE_MODEL || "openai/gpt-4o-mini";

  const response = await getClient().chat.completions.create({
    model,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 200,
  });

  const rewritten = response.choices[0]?.message?.content?.trim();
  // Fallback to original question if rewrite fails
  return rewritten || question;
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
- Read the entire source content carefully before deciding whether the answer is present.

If, after carefully reading all sources, the answer is truly not contained anywhere in them, respond with exactly:
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

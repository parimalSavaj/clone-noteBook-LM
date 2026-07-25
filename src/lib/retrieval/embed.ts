import OpenAI from "openai";

/**
 * Lazily create the OpenRouter client (only when actually called).
 * Avoids build-time errors when env vars aren't set.
 */
function getClient() {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

/**
 * Generate an embedding vector for a single text input.
 */
export async function embedText(text: string): Promise<number[]> {
  const model =
    process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";

  const response = await getClient().embeddings.create({
    model,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Generate embedding vectors for multiple text inputs (batched).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model =
    process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";

  const response = await getClient().embeddings.create({
    model,
    input: texts,
  });

  return response.data.map((d) => d.embedding);
}

/**
 * Plain text extractor.
 * The simplest extractor — content is already text.
 */
export async function extractText(content: string): Promise<string> {
  return content.trim();
}

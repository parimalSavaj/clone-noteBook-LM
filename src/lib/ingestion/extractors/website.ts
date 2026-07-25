/**
 * Website/URL extractor.
 * Primary: jsdom + mozilla-readability (strips boilerplate, extracts article)
 * Fallback: puppeteer (JS-heavy sites where plain fetch returns little content)
 *
 * TODO: Install jsdom, @mozilla/readability, implement in Phase 4
 */
export async function extractWebsite(_url: string): Promise<string> {
  throw new Error("Website extraction not yet implemented — Phase 4");
}

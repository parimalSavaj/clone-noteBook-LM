/**
 * Website/URL extractor.
 * Primary: fetch + jsdom + @mozilla/readability (strips boilerplate, extracts article)
 * Fallback: puppeteer (JS-heavy sites where plain fetch returns little content)
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const MIN_CONTENT_LENGTH = 200;

/**
 * Parse HTML string through jsdom + Readability to extract readable text.
 */
function extractReadableText(html: string, url: string): string | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return article?.textContent?.trim() || null;
}

/**
 * Extract readable text content from a URL.
 *
 * 1. Fetch HTML and run through Readability.
 * 2. If the result is too short (JS-rendered page), fall back to Puppeteer.
 */
export async function extractWebsite(url: string): Promise<string> {
  // Stage 1: plain fetch + Readability
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NotebookLM-Clone/1.0; +http://localhost)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url} (status ${response.status})`);
  }

  const html = await response.text();
  const text = extractReadableText(html, url);

  if (text && text.length >= MIN_CONTENT_LENGTH) {
    return text;
  }

  // Stage 2: Puppeteer fallback for JS-rendered sites
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    throw new Error(
      `Website at ${url} appears to be JavaScript-rendered but puppeteer is not available. ` +
        `Install puppeteer to extract content from JS-heavy sites.`,
    );
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const renderedHtml = await page.content();
    const renderedText = extractReadableText(renderedHtml, url);

    if (!renderedText || renderedText.length < MIN_CONTENT_LENGTH) {
      throw new Error(
        `Could not extract meaningful content from ${url}. ` +
          `The page may be behind authentication or have no readable text.`,
      );
    }

    return renderedText;
  } finally {
    await browser.close();
  }
}

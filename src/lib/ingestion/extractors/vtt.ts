/**
 * VTT / SRT subtitle extractor.
 * VTT: node-webvtt
 * SRT: srt-parser-2
 */
import webvtt from "node-webvtt";
import SRTParser2 from "srt-parser-2";

export interface SubtitleCue {
  text: string;
  startTime: number; // seconds
  endTime: number; // seconds
}

/**
 * Extract subtitle cues from VTT or SRT content.
 *
 * @param content  Raw file content (VTT or SRT format)
 * @param format   'vtt' or 'srt' — determines which parser to use
 */
export async function extractVtt(
  content: string,
  format: "vtt" | "srt" = "vtt",
): Promise<SubtitleCue[]> {
  if (format === "srt") {
    return parseSrt(content);
  }
  return parseVtt(content);
}

function parseVtt(content: string): SubtitleCue[] {
  const parsed = webvtt.parse(content, { strict: false });

  return parsed.cues.map(
    (cue: { text: string; start: number; end: number }) => ({
      text: cue.text.replace(/<[^>]*>/g, "").trim(), // strip HTML tags in VTT
      startTime: cue.start,
      endTime: cue.end,
    }),
  );
}

function parseSrt(content: string): SubtitleCue[] {
  const parser = new SRTParser2();
  const parsed = parser.fromSrt(content);

  return parsed.map((entry) => ({
    text: entry.text.replace(/<[^>]*>/g, "").trim(),
    startTime: entry.startSeconds,
    endTime: entry.endSeconds,
  }));
}

/**
 * Group subtitle cues into time windows for chunking.
 * Each window is ~30-60 seconds of content.
 * Returns sections suitable for chunkSections().
 */
export function groupCuesIntoWindows(
  cues: SubtitleCue[],
  windowDurationSeconds = 45,
): Array<{ text: string; metadata: { startMs: number; endMs: number } }> {
  if (cues.length === 0) return [];

  const windows: Array<{
    text: string;
    metadata: { startMs: number; endMs: number };
  }> = [];
  let windowStart = cues[0].startTime;
  let windowTexts: string[] = [];

  for (const cue of cues) {
    // If this cue would push us past the window duration, close the current window
    if (
      cue.startTime - windowStart >= windowDurationSeconds &&
      windowTexts.length > 0
    ) {
      windows.push({
        text: windowTexts.join(" "),
        metadata: {
          startMs: Math.round(windowStart * 1000),
          endMs: Math.round(cue.startTime * 1000),
        },
      });
      windowStart = cue.startTime;
      windowTexts = [];
    }
    windowTexts.push(cue.text);
  }

  // Close the final window
  if (windowTexts.length > 0) {
    const lastCue = cues[cues.length - 1];
    windows.push({
      text: windowTexts.join(" "),
      metadata: {
        startMs: Math.round(windowStart * 1000),
        endMs: Math.round(lastCue.endTime * 1000),
      },
    });
  }

  return windows;
}

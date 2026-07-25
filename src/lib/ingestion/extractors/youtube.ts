/**
 * YouTube transcript extractor.
 * Uses youtube-transcript to pull captions as timestamped segments.
 */
import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptSegment {
  text: string;
  offset: number; // milliseconds
  duration: number; // milliseconds
}

/**
 * Extract the video ID from a YouTube URL.
 * Handles:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://youtube.com/watch?v=VIDEO_ID&t=123
 */
function extractVideoId(videoUrl: string): string {
  const url = new URL(videoUrl);

  // youtu.be/VIDEO_ID
  if (url.hostname === "youtu.be") {
    return url.pathname.slice(1);
  }

  // youtube.com/watch?v=VIDEO_ID
  const videoId = url.searchParams.get("v");
  if (videoId) {
    return videoId;
  }

  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/);
  if (embedMatch) {
    return embedMatch[1];
  }

  throw new Error(
    `Could not extract video ID from URL: ${videoUrl}. ` +
      `Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID`,
  );
}

/**
 * Fetch transcript segments from a YouTube video.
 *
 * @param videoUrl  Full YouTube URL
 * @returns Array of transcript segments with text, offset (ms), and duration (ms)
 */
export async function extractYouTube(
  videoUrl: string,
): Promise<TranscriptSegment[]> {
  const videoId = extractVideoId(videoUrl);

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      throw new Error("Transcript returned empty.");
    }

    return transcript.map((segment) => ({
      text: segment.text
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim(),
      offset: segment.offset,
      duration: segment.duration,
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No captions available for this video (${videoId}). ` +
        `Only videos with captions (auto-generated or uploaded) are supported. ` +
        `Original error: ${msg}`,
    );
  }
}

/**
 * Group transcript segments into time windows for chunking.
 * Same approach as VTT — 30-60 second windows.
 * Returns sections suitable for chunkSections().
 */
export function groupSegmentsIntoWindows(
  segments: TranscriptSegment[],
  windowDurationMs = 45000,
): Array<{ text: string; metadata: { startMs: number; endMs: number } }> {
  if (segments.length === 0) return [];

  const windows: Array<{
    text: string;
    metadata: { startMs: number; endMs: number };
  }> = [];
  let windowStart = segments[0].offset;
  let windowTexts: string[] = [];

  for (const segment of segments) {
    // If this segment would push us past the window duration, close the current window
    if (
      segment.offset - windowStart >= windowDurationMs &&
      windowTexts.length > 0
    ) {
      windows.push({
        text: windowTexts.join(" "),
        metadata: {
          startMs: Math.round(windowStart),
          endMs: Math.round(segment.offset),
        },
      });
      windowStart = segment.offset;
      windowTexts = [];
    }
    windowTexts.push(segment.text);
  }

  // Close the final window
  if (windowTexts.length > 0) {
    const lastSegment = segments[segments.length - 1];
    windows.push({
      text: windowTexts.join(" "),
      metadata: {
        startMs: Math.round(windowStart),
        endMs: Math.round(lastSegment.offset + lastSegment.duration),
      },
    });
  }

  return windows;
}

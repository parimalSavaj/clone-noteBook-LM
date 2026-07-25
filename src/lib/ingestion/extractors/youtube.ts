/**
 * YouTube transcript extractor.
 * Uses youtube-transcript to pull captions as timestamped segments.
 *
 * TODO: Install youtube-transcript, implement in Phase 4
 */
export interface TranscriptSegment {
  text: string;
  offset: number; // milliseconds
  duration: number; // milliseconds
}

export async function extractYouTube(
  _videoUrl: string
): Promise<TranscriptSegment[]> {
  throw new Error("YouTube extraction not yet implemented — Phase 4");
}

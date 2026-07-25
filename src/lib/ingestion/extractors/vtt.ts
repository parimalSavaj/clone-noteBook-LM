/**
 * VTT / SRT subtitle extractor.
 * VTT: node-webvtt
 * SRT: srt-parser-2
 *
 * TODO: Install node-webvtt, srt-parser-2, implement in Phase 4
 */
export interface SubtitleCue {
  text: string;
  startTime: number; // seconds
  endTime: number; // seconds
}

export async function extractVtt(_content: string): Promise<SubtitleCue[]> {
  throw new Error("VTT extraction not yet implemented — Phase 4");
}

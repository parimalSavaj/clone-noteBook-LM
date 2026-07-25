declare module "node-webvtt" {
  interface Cue {
    identifier: string;
    start: number;
    end: number;
    text: string;
    styles: string;
  }

  interface ParseResult {
    valid: boolean;
    cues: Cue[];
  }

  interface ParseOptions {
    strict?: boolean;
  }

  function parse(input: string, options?: ParseOptions): ParseResult;
  function compile(input: ParseResult): string;

  export default { parse, compile };
}

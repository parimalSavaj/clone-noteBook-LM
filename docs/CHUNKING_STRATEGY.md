# Chunking Strategy

## Core principles

**Split by tokens, not characters.**
Embedding models think in tokens. A character-based cutoff can land mid-word or quietly push a chunk over the model's budget. Every split uses a token-length function (via `js-tiktoken`) so chunks are always within `text-embedding-3-small`'s 8 191-token limit.

**Recursive splitting, not blind fixed-size chops.**
A `RecursiveCharacterTextSplitter` (from `@langchain/textsplitters`) splits on paragraph breaks first, falling back to sentence boundaries, then words, only resorting to a hard cut as a last resort. Related sentences stay together far more often than with naive slicing.

**10–20% overlap between adjacent chunks.**
Ideas that straddle a chunk boundary don't get cut in a way that breaks retrieval. We use 15% overlap (~60 tokens on a 400-token chunk).

**Target size: 300–500 tokens per chunk.**
Small enough for precise retrieval; large enough that each chunk is a coherent, self-contained thought. Default target is **400 tokens**.

---

## Two-stage pipeline

A single flat split across an entire document throws away structure the extractors already preserved. Instead:

**Stage 1 — Structure-aware pre-split**
Break each document along its _natural_ boundaries first (headings, pages, time windows). This uses structure the extractor already gives you — don't discard it before chunking.

**Stage 2 — Recursive token-split within each unit**
If a section/page/time-window is still over the target size, recursively split it down with overlap. Convert Stage-1 output into a lightweight Markdown intermediate (headings preserved as `#`/`##`) and run a header-aware split, then token-split anything still oversized.

---

## Per-source breakdown

| Source         | Stage 1 — natural split unit                                                          | Stage 2 — recursive target          | Metadata per chunk                                |
| -------------- | ------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| **Plain text** | Paragraph breaks (`\n\n`)                                                             | 400 tokens, 15% overlap             | `chunkIndex`, `charOffset`                        |
| **PDF**        | Page boundaries (or heading boundaries if `pdfjs-dist` position data shows a heading) | 400 tokens, 15% overlap             | `pageNumber(s)`                                   |
| **Web pages**  | Headings (`h1`/`h2`/`h3`) from Readability-cleaned HTML                               | 400 tokens, 15% overlap             | `headingPath`, `sectionAnchor`                    |
| **YouTube**    | Time windows — group caption segments into ~30–60 s blocks, never split mid-sentence  | Merge up to 400 tokens              | `startMs`, `endMs`                                |
| **VTT / SRT**  | Same as YouTube — time-window grouping                                                | Same                                | `startMs`, `endMs`                                |
| **DOCX**       | Headings from `mammoth` HTML output                                                   | 400 tokens, 15% overlap             | `headingPath`                                     |
| **CSV**        | Row groups (20–50 rows) — never split mid-row                                         | Group by row count, not token count | `rowRange`, column headers repeated in each chunk |

---

## Stable chunk identity

Every chunk carries two identity fields:

- **`chunk_id`** — UUID, stable across re-indexes (same source content → same ID, detected via content hash)
- **`sequence_index`** — integer position within the parent document (0-based)

`sequence_index` enables "expand context" without re-searching: if a retrieved chunk isn't enough on its own, pull its neighbors by `sequence_index ± 1` from the same `source_id`. This is a standard quality upgrade once the basic pipeline is working (Phase 7).

---

## Implementation stack

| Package                    | Role                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@langchain/textsplitters` | `RecursiveCharacterTextSplitter` with token-aware length function; `MarkdownHeaderTextSplitter` for Stage 1 heading splits |
| `js-tiktoken`              | Token counting — feeds the length function so every chunk stays within budget                                              |

```ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";

const enc = encodingForModel("text-embedding-3-small");

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400, // tokens
  chunkOverlap: 60, // ~15%
  lengthFunction: (text) => enc.encode(text).length,
});
```

---

## What this replaces

The earlier draft used character-based fixed-size splitting (2 400 chars, 360-char overlap). That was simpler to implement but:

- Character counts don't map reliably to token counts across different content types (code, non-English text, and symbol-heavy content all have very different chars-per-token ratios)
- A flat split ignores structure the extractors already give us — page numbers, headings, timestamps — which are the same fields citations rely on
- Boundary snapping heuristics (walk back to find a sentence end) are a workaround for a problem recursive splitting solves structurally

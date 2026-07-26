# Features

## Source Management

- Upload multiple source types (PDF, Plain Text, Website URL, YouTube Video, VTT/Transcript)
- Remove or re-index any source
- Visual status indicators (uploading, indexing, ready)
- Source versioning — when a user updates/replaces a source, track changes and re-index automatically without breaking existing references

## Smart Source Organization (Optional/Advanced)

- On new source upload, generate a quick summary/preview of the source content
- Suggest which existing notebook/folder the source belongs to based on its content similarity
- Auto-categorize sources if user opts in

## Source Relevance Scoring

- After adding a new source to a notebook, display a relevance score showing how related it is to the other sources already in that notebook
- Help users understand if a source fits well or might belong elsewhere

## Unified Vector Pipeline (Background)

- When a notebook contains similar types of data, optimize chunking and embedding strategies per content type
- Background processing — re-chunk or re-embed when strategies improve, without blocking the user
- Deduplication detection across sources within a notebook

## Chunk Visualization

- For any source, display the actual chunks created from it
- PDF: show the PDF with highlighted sections per chunk
- Text: highlight chunk boundaries in the original text
- Transcript/VTT: highlight time-segmented chunks
- Website: show extracted sections with chunk boundaries
- YouTube: show transcript segments with timestamps per chunk
- Allow users to inspect, merge, or split chunks manually (optional)

## Core RAG Pipeline

- Content extraction from all supported source types
- Configurable chunking strategy (size, overlap)
- Embedding generation and vector storage
- Metadata preservation (page numbers, timestamps, URLs, sections)
- Hybrid search (vector similarity + keyword matching)
- Context-aware retrieval with re-ranking
- Grounded LLM responses with streaming
- Prompt construction with retrieved context

## Citations & Source Viewer

- Every answer includes inline citations
- Click citation to open original source at the exact location
- PDF → opens at the relevant page/section
- YouTube → jumps to the referenced timestamp
- Website → opens or previews the page
- Text/Transcript → highlights the cited chunk

## Notebook Management

- Create, rename, delete notebooks
- Each notebook has its own isolated knowledge base
- Notebook-level settings (chunking strategy, embedding model, etc.)

## Query & Conversation

- Natural language question input
- Streaming AI responses
- Conversation history within a notebook
- Follow-up questions with context awareness

## UI/UX Essentials

- Drag-and-drop file upload
- Loading and progress states everywhere
- Empty states with guidance
- Responsive design
- Clean, minimal notebook experience

---

## Data Ingestion Strategy — Sources & Extraction Tools (Node.js)

Stack decision (Phase 0): ingestion pipeline is Node.js/JavaScript. Audio/video transcription (Whisper API / Deepgram / AssemblyAI) is explicitly out of scope for now.

| Source                     | Tool                  | What It Does                                                                                                                                | Needs API Key?                                               |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **PDF Documents**          | `pdf-parse`           | Primary extractor — fast, simple text extraction for standard, single-column PDFs                                                           | No                                                           |
|                            | `pdfjs-dist`          | Fallback — extracts text with layout/position data to handle complex layouts (multi-column pages, tables) that `pdf-parse` garbles          | No                                                           |
| **Web Pages & URLs**       | `jsdom`               | Builds an actual DOM object from fetched HTML — required because `mozilla-readability` needs a real DOM, not a cheerio object               | No                                                           |
|                            | `mozilla-readability` | Strips ads/navigation and extracts the core article content from the DOM built by `jsdom`                                                   | No                                                           |
|                            | `puppeteer`           | Fallback for JavaScript-heavy sites — renders the full page in headless Chrome when a plain fetch + Readability returns too little content  | No                                                           |
| **YouTube Videos**         | `youtube-transcript`  | Fetches captions (auto-generated or uploaded) as timestamped segments (`text` + `offset` + `duration`), enabling timestamp-linked citations | No                                                           |
| **Google Docs & Drive**    | `googleapis`          | Handles OAuth authentication and calls the Drive API to export Docs as plain text or HTML                                                   | **Yes** — Google Cloud OAuth Client ID/Secret + user consent |
| **VTT / SRT Subtitles**    | `node-webvtt`         | Parses `.vtt` files, separating timestamps from clean transcript text                                                                       | No                                                           |
|                            | `srt-parser-2`        | Parses `.srt` files (different spec/syntax from VTT), same purpose for SRT-formatted files                                                  | No                                                           |
| **Word Documents (.docx)** | `mammoth`             | Converts DOCX layout into clean, semantic HTML or plain text                                                                                | No                                                           |
| **Spreadsheets (.csv)**    | `csv-parser`          | Streams and serializes CSV rows/columns into text-readable format                                                                           | No                                                           |

Cascade rules (don't run every tool every time):

- **PDF**: try `pdf-parse` first (cheaper/faster); only invoke `pdfjs-dist` when the output looks broken or the layout is complex.
- **Web pages**: try `jsdom` + `mozilla-readability` on the plain-fetched HTML first; only fall back to `puppeteer` if the extracted content looks too short/empty.
- **Google Drive** is the only source here requiring a real third-party credential (OAuth) — everything else is a self-hosted, open-source npm package with no external account or per-use billing.
- Google Docs/Drive, DOCX, and CSV are extensions beyond the 5 core source types in `PROJECT.md` — treat them as stretch scope after the core RAG loop (Phase 3) and core source types (Phase 4) are solid, since the rubric only grades the original 5.

---

# Build Roadmap

A phased checklist for building this project. Each phase ends with a checkpoint — don't move to the next phase until the checkpoint works. This order exists so you always have a working system, instead of five half-built features at once.

---

## Phase 0 — Setup & Decisions

Decide these once, in writing, before writing feature code.

- [x] Stack: Next.js (App Router), Postgres + pgvector (self-hosted via Docker), LLM + embeddings via **OpenRouter** (single API key, OpenAI-compatible), background jobs via **BullMQ + Redis** (Redis also via Docker)
- [x] Auth: **none** — local-only app, no login required; all rows use a hardcoded `userId = "local"`
- [x] Docker: `docker-compose.yml` running Postgres+pgvector and Redis locally — no hosted DB/queue accounts
- [x] Ingestion layer: Node.js/JavaScript, per-source extraction library decided — see [Data Ingestion Strategy](#data-ingestion-strategy--sources--extraction-tools-nodejs) table above
- [x] Repo folder structure (separate ingestion, retrieval, jobs, and API layers early)
- [x] Chunking strategy — token-aware recursive splitting (400 tokens, 15% overlap, two-stage structure-aware pipeline); documented in `docs/CHUNKING_STRATEGY.md`
- [x] `.env.example` scaffold: `DATABASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL`, `REDIS_URL`

Chunking decision documented in `docs/CHUNKING_STRATEGY.md`.

**No live deployment for this project** — runs locally only (Next.js dev server + Docker containers for Postgres/Redis). See note in Phase 9.

---

## Phase 1 — Notebook/Workspace Foundation

- [x] Schema: `notebooks`, `sources`, `chunks` tables — `userId` column kept with default `"local"`; each chunk carries `notebook_id`, `source_id`, plus type-specific metadata (page, timestamp, offset)
- [x] `GET`, `POST` `/api/notebooks` — list and create
- [x] `GET`, `PATCH`, `DELETE` `/api/notebooks/[id]` — fetch single, rename, delete (cascades to sources and chunks)
- [x] Notebooks list page — create form, inline rename, delete with confirmation, empty state, links to detail page
- [x] Notebook detail page — fetches notebook by id, not-found state, placeholder sections for Sources and Chat
- [x] Vector search scoped to `notebook_id` only — no user isolation needed

**Checkpoint:** Create, rename, and delete a notebook end-to-end in the UI. ✓

---

## Phase 2 — Prove the Pipeline with One Source Type (Plain Text)

Build the full ingestion skeleton against the simplest input first.

- [x] Upload a plain text source (paste-as-text form on the notebook detail page)
- [x] Background job: `indexing` status update → extract → chunk (token-aware recursive) → batch embed → store chunks + vectors in DB → `ready` status update
- [x] `error` status set on failure so the UI reflects a failed job rather than staying stuck on `indexing`
- [x] Status field (`uploading` → `indexing` → `ready` / `error`) updates live via polling (2.5 s interval, stops when all sources settle)
- [x] Status badges with animated pulse for in-progress, green for ready, red for error
- [x] Remove a source — `DELETE /api/sources/[id]` cascades to chunks, updates parent notebook `updatedAt`
- [x] Empty state when no sources exist

**Checkpoint:** Upload a text source, watch the status flip to `ready`, confirm chunk rows with embeddings exist in the DB. ✓

---

## Phase 3 — Core RAG Loop, End-to-End

- [x] Embed the query, vector-search scoped to the current notebook (top-5 by cosine similarity)
- [x] Retrieved chunks → system prompt with numbered sources → LLM call (OpenRouter / gpt-4o-mini)
- [x] Streaming response — tokens arrive incrementally via `ReadableStream`
- [x] Inline citation markers in the answer (`[1]`, `[2]`, …) matching the retrieved chunks
- [x] Citations panel below the latest answer — shows source name and chunk index for each retrieved chunk
- [x] Multi-turn conversation thread — full history visible, follow-up questions work
- [x] Non-streaming fallback when retrieval returns 0 results — `application/json` response with "not found in your sources" message
- [x] Input disabled while a request is in flight

**Checkpoint:** Ask a question about your text source, get a grounded streamed answer with inline citations. ✓

---

## Phase 4 — Expand Ingestion to Remaining Source Types

Ordered easiest → riskiest:

- [x] Website URL — `jsdom` + `mozilla-readability` on plain-fetched HTML; `puppeteer` fallback for JS-rendered sites returning < 200 chars
- [x] PDF — `pdf-parse` v2 (class-based API); per-page extraction with `pageNumber` metadata via `extractPdfPages()`; base64 transfer from UI → worker → Buffer
- [x] VTT/SRT — `node-webvtt` for `.vtt`, `srt-parser-2` for `.srt`; HTML tag stripping; time-window grouping (45s windows) with `startMs`/`endMs` metadata
- [x] YouTube — `youtube-transcript`; 3 URL format support; HTML entity decoding; "no captions available" error path; time-window grouping with `startMs`/`endMs` metadata
- [x] Worker expanded to full `switch` over all 5 types; website/YouTube store extracted content back to `rawContent`
- [x] Upload UI — type selector buttons, per-type input (textarea / URL field / file picker), `FileReader` for base64 and text file reading
- [x] Re-index action — `POST /api/sources/[id]/reindex` deletes existing chunks, resets status, re-enqueues; Re-index button on each source row

**Checkpoint:** One notebook holding all five source types, all reaching `ready`. ✓

---

## Phase 5 — Citations & Source Viewer, Per Type

- [x] Citations pinned to each assistant message — `Message` interface carries `citations?: Citation[]`; global citations state removed; every answer in the thread shows its own citations permanently
- [x] PDF → `[N] Name — page N` label (no in-app viewer; Phase 7)
- [x] Website → `[N] Name` linked to original URL, opens in new tab
- [x] YouTube → `[N] Name — M:SS` linked to `youtube.com/watch?v=ID&t=SECONDS`, opens at cited timestamp
- [x] VTT/SRT → `[N] Name — M:SS – M:SS` timestamp range label
- [x] Text → `[N] Name — chunk N` label
- [x] `buildCitationHref()` and `buildCitationLabel()` helpers, `formatTimestamp()` utility
- [x] `X-Citations` header read before stream body; metadata defensively parsed in both streaming and JSON fallback paths

**Checkpoint:** Click a citation for every source type; YouTube and Website open at the correct location. ✓

---

## Phase 6 — Response Quality

- [x] Stream the answer token by token (already working; verified clean)
- [x] Tighter system prompt — strict inline citation rules (citation before the period, `[1][2]` for multi-source sentences, no references section, no uncited claims), exact "not found" phrase enforced
- [x] Source names shown in context block instead of raw UUIDs — `route.ts` builds a `sourceNames` map via a DB lookup and passes it to `generateAnswer()`
- [x] Similarity threshold — `vectorSearch()` accepts `minSimilarity: 0.3`; SQL WHERE clause filters below threshold; "not found" fallback fires naturally for off-topic questions
- [x] `similarity` score added to `X-Citations` header and shown as `(N% match)` in citation labels
- [x] Markdown rendering — `react-markdown` with `prose prose-sm dark:prose-invert max-w-none` wrapper; `@tailwindcss/typography` wired via `@plugin` in `globals.css` (Tailwind v4 CSS-first config)
- [x] Citations pinned per-message already from Phase 5 — confirmed correct

**Checkpoint:** Answers stream, markdown renders, citations are consistently inline with the specific claim, similarity scores visible, "not found" fallback fires cleanly. ✓

**Checkpoint:** Ask several varied questions; answers stream and citations are consistently correct.

---

## Phase 7 — Advanced Features (Once Phases 1–6 Are Solid)

- [x] **Hybrid search** — `keywordSearch()` via Postgres `tsvector`/`tsquery` + `vectorSearch()` merged with RRF (`k=60`); GIN index `chunks_content_fts_idx` added in `migrate.ts` and confirmed in DB; `hybridSearch()` runs both in parallel via `Promise.all`
- [x] **Multi-turn query rewriting** — `rewriteQuery()` in `generate.ts`; `route.ts` accepts `history[]`, rewrites when `history.length > 2` using gpt-4o-mini at `temperature: 0`; frontend passes last 6 messages as history
- [x] **Neighbour expansion** — `expandWithNeighbours()` fetches `chunk_index ± 1` for top-3 results, deduplicates against existing result set, merges content seamlessly; `X-Citations` still sends original chunks (not expanded) so citation metadata stays precise
- [x] **Source relevance scoring** — `computeRelevanceScore()` in worker runs after status → `ready`; averages top-3 cosine similarities per new chunk against all existing notebook chunks; non-fatal catch; skips for first source in notebook; stored as `real` column on sources; `RelevanceBadge` component with green (>70%) / amber (40–70%) / red (<40%) colour scale

---

## Phase 8 — Polish (Explicit Rubric Line Items)

- [x] Upload early-return bug fixed — validation before `setUploading(true)`, non-null assertions safe after guard
- [x] Loading states — `renamingId` / `deletingId` on notebooks page; re-index already had `reindexingId`; all buttons disabled during in-flight requests
- [x] Empty states — all existing empty states confirmed; description shown on notebook detail when present
- [x] Visible error handling — `fetchError` (with retry) on both pages; `actionError` dismissable banner on notebooks list; `uploadError` / `sourceError` inline on detail page; empty stream fallback in chat
- [x] Background poll `catch` intentionally silent — transient poll failures don't surface as errors
- [x] Responsive layout — `p-4 sm:p-8` on both pages; chat panel `min-h-[300px] max-h-[500px]`; source names `truncate min-w-0`; type badge `flex-shrink-0`
- [x] Body font fixed — `var(--font-sans), Arial, Helvetica, sans-serif` uses Geist Sans via CSS variable
- [x] Description field added to notebook create form; `formatRelativeTime()` shows `updatedAt` on notebook list rows
- [x] Dead `console.error` calls removed from all user-facing catch blocks

**Checkpoint:** Every async action shows feedback; layout holds at 375px; Geist font renders correctly. ✓

---

## Phase 9 — Deployment & Docs

Don't leave this for the last hour — README/demo video work is still real effort even without a live deploy.

- [ ] ~~Deploy the live version~~ — **not doing this.** Scope decision: project runs locally only, via `docker compose up -d` (Postgres+pgvector, Redis) + `npm run dev` (Next.js) + `npm run worker` (BullMQ worker). `PROJECT.md` lists "Live Deployment" as a submission item — if this needs to satisfy that rubric line, confirm a local-only run (repo + demo video) is acceptable before the deadline, or revisit this decision.
- [ ] README: setup steps (including `docker compose up -d` and running the worker), architecture explanation, retrieval flow, env vars (`DATABASE_URL`, `OPENROUTER_API_KEY`, `REDIS_URL`)
- [ ] Demo video: full end-to-end flow run locally, 2–3 technical decisions explained (e.g. why OpenRouter, why BullMQ over a DB job table, why pgvector over a separate vector DB)
- [ ] Push to a public GitHub repo

---

## Phase 10 — Bonus (Only If Everything Above Is Solid)

These sit outside the graded rubric entirely — lowest priority. (Note: `PROJECT.md`'s per-category marks sum to 130, not 140 — worth confirming against the original assignment if that number matters for planning.)

- [ ] YouTube/playlist personalized learning roadmap
- [ ] Podcast-style voice-over generated from sources

---

## The One Rule

> Phases 0–3 are your walking skeleton — one source type, full loop, working. Don't touch Phase 4 or Phase 10 until that skeleton runs end-to-end. Phases 4–6 are where most graded marks live. Phase 9 happens regardless of how much of Phase 7/8 you get to.

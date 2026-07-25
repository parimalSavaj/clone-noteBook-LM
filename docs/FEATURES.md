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

- [ ] Schema: `notebooks`, `sources`, `chunks` tables — `userId` column kept with default `"local"` (no migration needed if DB is fresh); each chunk carries `notebook_id`, `source_id`, plus type-specific metadata (page, timestamp, offset)
- [ ] Create / rename / delete a notebook
- [ ] Vector search scoped to `notebook_id` only — no user isolation needed
- [ ] Empty state for "no notebooks yet"

**Checkpoint:** Create, rename, and delete a notebook end-to-end in the UI.

---

## Phase 2 — Prove the Pipeline with One Source Type (Plain Text)

Build the full ingestion skeleton against the simplest input first.

- [ ] Upload a plain text source
- [ ] Background job: chunk → embed → store in vector DB
- [ ] Status field (`uploading` → `indexing` → `ready`) updates live in the UI
- [ ] Remove a source (cascades to delete its chunks)

**Checkpoint:** Upload a text file, watch the status flip to ready, see it listed.

---

## Phase 3 — Core RAG Loop, End-to-End

- [ ] Embed the query, vector-search scoped to the current notebook
- [ ] Retrieved chunks → prompt template → LLM call
- [ ] Return the answer plus which chunk IDs it used
- [ ] Inline citation markers in the answer (`[1]`, `[2]`, …)
- [ ] Explicit "not found in your sources" fallback when retrieval is empty or weak

**Checkpoint:** Ask a question about your one text source, get a grounded, cited answer.

---

## Phase 4 — Expand Ingestion to Remaining Source Types

Ordered easiest → riskiest:

- [ ] Website URL — `jsdom` + `mozilla-readability` on the plain-fetched HTML first; fall back to `puppeteer` only if extracted content is too short/empty (fetch + strip boilerplate/HTML down to article content)
- [ ] PDF — `pdf-parse` first (fast, simple); fall back to `pdfjs-dist` for complex/multi-column layouts since it returns text with layout/position data, not just plain text; needed for Phase 5's "opens at the relevant section"
- [ ] VTT/Transcript — `node-webvtt` for `.vtt`, `srt-parser-2` for `.srt`; parse timestamped cues directly
- [ ] YouTube — `youtube-transcript` to pull captions as timestamped segments (`text` + `offset` + `duration`); build the "no captions available" error path first
- [ ] Re-index action, wired up for every source type

**Checkpoint:** One notebook holding all five source types, all reaching "ready."

---

## Phase 5 — Citations & Source Viewer, Per Type

Treat each row as its own task:

- [ ] PDF → opens at the relevant page/section
- [ ] Website → opens or previews the page
- [ ] YouTube → opens the video at the cited timestamp
- [ ] Text → highlights the relevant span
- [ ] Transcript → highlights the cited chunk

**Checkpoint:** Click a citation for every source type; confirm each opens correctly.

---

## Phase 6 — Response Quality

- [ ] Stream the answer token by token
- [ ] Tighten the system prompt (grounding instructions + required citation format)
- [ ] Formatting pass — markdown rendering, clean citation display

**Checkpoint:** Ask several varied questions; answers stream and citations are consistently correct.

---

## Phase 7 — Advanced Features (Once Phases 1–6 Are Solid)

These strengthen "retrieval quality" and "overall engineering thoughtfulness."

- [ ] Hybrid search — vector + keyword/BM25 alongside pure vector search
- [ ] Small eval set (10–20 question/expected-chunk pairs); rerun after any retrieval change
- [ ] Multi-turn query rewriting so follow-up questions retrieve correctly
- [ ] Source relevance scoring on new uploads
- [ ] Chunk visualization for all source types
- [ ] Smart source organization suggestions
- [ ] Background re-chunking/re-embedding pipeline

---

## Phase 8 — Polish (Explicit Rubric Line Items)

- [ ] Loading state for every async action
- [ ] Empty states (no notebooks / no sources / no messages yet)
- [ ] Visible error handling — failed upload, failed indexing, LLM timeout
- [ ] Responsive layout pass
- [ ] Folder structure and code cleanup pass

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

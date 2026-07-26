# NotebookLM Clone

A local-first, RAG-powered research assistant inspired by Google's NotebookLM. Upload multiple knowledge sources (PDF, plain text, websites, YouTube videos, VTT/SRT transcripts), ask natural-language questions, and get grounded answers with inline citations — all running on your machine with no external database or vector service required.

Built with Next.js 16, PostgreSQL + pgvector for unified relational + vector storage, BullMQ for background job processing, and OpenRouter for LLM + embeddings via a single API key.

## Demo Video

[Watch the full demo (Google Drive)](https://drive.google.com/file/d/13rvw136RkqxvvUjRgVH1wVB7--rfCx1Z/view?usp=sharing)

The video covers: notebook management, source ingestion across all 5 types, RAG-powered Q&A with citations, hybrid search in action, and key technical decisions.

---

## Prerequisites

| Tool                           | Version                          | Why                              |
| ------------------------------ | -------------------------------- | -------------------------------- |
| Node.js                        | 20+                              | Runtime                          |
| Docker Desktop / Docker Engine | 24+                              | Runs Postgres + Redis containers |
| Docker Compose                 | v2 (bundled with Docker Desktop) | Orchestrates containers          |

---

## Quick Start

```bash
# 1. Clone and install dependencies
git clone https://github.com/parimalSavaj/clone-noteBook-LM.git
cd clone-noteBook-LM
npm install

# 2. Create your environment file and add your OpenRouter API key
cp .env.example .env.local
# Edit .env.local → paste your OPENROUTER_API_KEY (get one at https://openrouter.ai/keys)

# 3. Start Postgres (with pgvector) and Redis via Docker
docker compose up -d

# 4. Create database tables (Drizzle ORM schema push)
npm run db:push

# 5. Run migration (enables pgvector extension, adds embedding column + HNSW/GIN indexes)
npm run db:migrate

# 6. Start the Next.js dev server (Terminal 1)
npm run dev

# 7. Start the BullMQ background worker (Terminal 2 — required for source indexing)
npm run worker
```

### Verification checklist

- Both containers show `healthy` in `docker compose ps`
- `http://localhost:3000` loads and redirects to `/notebooks`
- Worker terminal prints `"Source indexing worker started. Waiting for jobs..."`

---

## Environment Variables

All variables are defined in `.env.example`. Copy it to `.env.local` and fill in:

| Variable                     | Required | Where to get it                                                        |
| ---------------------------- | -------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`               | Yes      | Pre-filled — matches `docker-compose.yml`                              |
| `OPENROUTER_API_KEY`         | Yes      | [openrouter.ai/keys](https://openrouter.ai/keys) — free tier available |
| `OPENROUTER_CHAT_MODEL`      | No       | Default: `openai/gpt-4o-mini`                                          |
| `OPENROUTER_EMBEDDING_MODEL` | No       | Default: `openai/text-embedding-3-small`                               |
| `REDIS_URL`                  | Yes      | Pre-filled — matches `docker-compose.yml`                              |
| `NEXT_PUBLIC_APP_URL`        | No       | Default: `http://localhost:3000`                                       |

**Non-default ports:** Postgres runs on `5434` (not `5432`) and Redis on `6380` (not `6379`) to avoid clashing with other local instances you may have running.

---

## Architecture

### Layers

- **Next.js App Router** — UI + API routes in a single repo. Server components for data fetching, client components for interactive UI (chat, file upload, status polling).
- **PostgreSQL + pgvector** — Single database for both relational data (notebooks, sources) and vector similarity search (chunks + embeddings). No separate vector DB needed.
- **BullMQ + Redis** — Background job queue for source indexing. Decouples the upload response from the slow extract → chunk → embed pipeline, with automatic retries on failure.
- **OpenRouter** — Single API key for both chat completions (`gpt-4o-mini`) and embeddings (`text-embedding-3-small`). OpenAI-compatible, so the `openai` SDK works without modification.

### Query flow (RAG pipeline)

```
User types question
  → POST /api/query
  → rewriteQuery()        — if follow-up, rewrite to standalone query via LLM
  → hybridSearch()        — vector search (cosine similarity) + keyword search (tsvector) merged via RRF
  → expandWithNeighbours() — fetch adjacent chunks for top-3 results for fuller context
  → generateAnswer()      — system prompt with numbered sources + strict citation rules → OpenRouter stream
  → ReadableStream response + X-Citations header
  → UI streams tokens into message bubble, pins citations on done
```

### Ingestion flow

```
User uploads source
  → POST /api/sources → BullMQ job enqueued → source status = "uploading"
  → Worker picks up job:
      extract (type-specific extractor)
      → chunk (RecursiveCharacterTextSplitter, 400 tokens, 15% overlap)
      → embed (batch via text-embedding-3-small)
      → INSERT INTO chunks with ::vector cast
      → computeRelevanceScore() against existing notebook chunks
      → source status = "ready"
  → UI polling every 2.5s detects status change
```

---

## Key Technical Decisions

**Why pgvector instead of a separate vector database (Pinecone, Weaviate, etc.)?**

The relational data (notebooks → sources → chunks) already lives in Postgres. Using pgvector keeps everything in one database — no connection pooling to two systems, no sync issues between the relational and vector stores, and cascade deletes work naturally. For a local app with thousands (not billions) of vectors, pgvector's HNSW index is more than fast enough.

**Why OpenRouter instead of calling OpenAI directly?**

OpenRouter provides a single OpenAI-compatible endpoint for both chat and embeddings across many model providers. The model can be swapped by changing one env var (`OPENROUTER_CHAT_MODEL`) without touching code. No separate account or billing for embeddings vs chat.

**Why BullMQ instead of processing uploads synchronously in the API route?**

Source indexing (extract → chunk → embed) is slow — a large PDF or long YouTube transcript can take 10–30 seconds. Doing this synchronously in a Next.js API route would time out, block the response, and give the user no progress feedback. BullMQ processes jobs in a separate process, lets the API return immediately with the source at `uploading` status, and the UI polls for progress. It also provides automatic retries on failure.

**Why hybrid search (vector + keyword) instead of pure vector search?**

Pure vector search handles semantic similarity well but struggles with exact keyword matches — product codes, proper names, or technical terms that are rare in the training data. Postgres full-text search (`tsvector`) handles those cases precisely. Combining both via RRF (Reciprocal Rank Fusion) gives the best of both: semantic understanding from the vector side, exact matching from the keyword side, with a single unified ranking.

---

## Scripts Reference

| Command              | What it does                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| `npm run dev`        | Start Next.js development server on :3000                                |
| `npm run worker`     | Start BullMQ background worker (separate terminal)                       |
| `npm run build`      | Production build                                                         |
| `npm run db:push`    | Push Drizzle schema to database (creates tables)                         |
| `npm run db:migrate` | Run migration (pgvector extension, embedding column, HNSW + GIN indexes) |
| `npm run db:studio`  | Open Drizzle Studio database browser                                     |

---

## View Database

```bash
# Visual UI
npm run db:studio

# Or via command line
docker exec -it notebooklm-postgres psql -U notebooklm -d notebooklm
```

---

## Stopping / Resetting

```bash
# Stop containers, keep data
docker compose stop

# Stop and wipe all data (fresh start)
docker compose down -v
```

---

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Framework        | Next.js 16 (App Router)                             |
| Database         | PostgreSQL 16 + pgvector                            |
| ORM              | Drizzle ORM                                         |
| Queue            | BullMQ + Redis 7                                    |
| LLM / Embeddings | OpenRouter (OpenAI SDK compatible)                  |
| Styling          | Tailwind CSS v4                                     |
| Chunking         | @langchain/textsplitters + js-tiktoken              |
| PDF extraction   | pdf-parse                                           |
| Web scraping     | jsdom + @mozilla/readability + puppeteer (fallback) |
| YouTube          | youtube-transcript                                  |
| VTT/SRT          | node-webvtt + srt-parser-2                          |

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Notebook list + detail pages
│   ├── api/
│   │   ├── notebooks/        # CRUD endpoints
│   │   ├── sources/          # Upload, delete, re-index endpoints
│   │   └── query/            # RAG query endpoint (streaming)
│   └── layout.tsx
├── lib/
│   ├── db/                   # Drizzle schema, connection, migrations
│   ├── ingestion/
│   │   ├── chunking/         # Token-aware recursive text splitter
│   │   └── extractors/       # Per-type extractors (pdf, text, website, youtube, vtt)
│   ├── jobs/                 # BullMQ queue, Redis connection, worker
│   └── retrieval/            # embed, search (hybrid), generate (streaming)
└── types/
```

---

## License

MIT

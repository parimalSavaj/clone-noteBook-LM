# NotebookLM Clone

A local-first clone of Google's NotebookLM — upload sources and ask questions using RAG-powered chat.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create env file and add your OpenRouter API key
cp .env.example .env.local

# 3. Start Postgres + Redis
docker compose up -d

# 4. Setup database
npm run db:push
npm run db:migrate

# 5. Start the app (two terminals needed)
npm run dev        # Terminal 1 — Next.js app
npm run worker     # Terminal 2 — Background job worker
```

App runs at [http://localhost:3000](http://localhost:3000)

The worker processes source uploads (chunking + embedding). Without it, sources stay stuck on "Uploading" status.

## View Database

```bash
npm run db:studio
```

Opens Drizzle Studio UI to browse tables and rows.

Or via command line:

```bash
docker exec -it notebooklm-postgres psql -U notebooklm -d notebooklm
```

## Scripts

- `npm run dev` — Start dev server
- `npm run db:push` — Push schema to database
- `npm run db:migrate` — Run pgvector migration
- `npm run db:studio` — Browse database visually
- `npm run worker` — Start background job worker

## Tech

Next.js 16, PostgreSQL + pgvector, Drizzle ORM, BullMQ, Redis, OpenRouter, Tailwind CSS

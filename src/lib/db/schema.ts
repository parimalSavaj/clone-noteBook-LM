import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  varchar,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// Notebooks
// ============================================================================

export const notebooks = pgTable("notebooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  // userId is kept in the schema for future multi-user support.
  // For local-only usage, all rows use userId = "local".
  userId: text("user_id").notNull().default("local"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Sources
// ============================================================================

export type SourceType = "pdf" | "text" | "website" | "youtube" | "vtt";
export type SourceStatus = "uploading" | "indexing" | "ready" | "error";

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .references(() => notebooks.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull().default("local"),
    type: varchar("type", { length: 20 }).$type<SourceType>().notNull(),
    name: text("name").notNull(),
    status: varchar("status", { length: 20 })
      .$type<SourceStatus>()
      .default("uploading")
      .notNull(),
    // Type-specific metadata (URL, filename, youtube video ID, etc.)
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Raw content stored after extraction (before chunking)
    rawContent: text("raw_content"),
    // Relevance score: how well this source relates to other sources in the notebook (0-1, null = not computed)
    relevanceScore: real("relevance_score"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("sources_notebook_idx").on(table.notebookId)],
);

// ============================================================================
// Chunks
// ============================================================================

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .references(() => sources.id, { onDelete: "cascade" })
      .notNull(),
    notebookId: uuid("notebook_id")
      .references(() => notebooks.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull().default("local"),
    content: text("content").notNull(),
    // pgvector embedding — stored as vector(1536) for text-embedding-3-small.
    // Column is added via raw SQL in migrate.ts (Drizzle has no native pgvector type).

    // Chunk ordering within a source
    chunkIndex: integer("chunk_index").notNull(),
    // Type-specific metadata: page number, timestamp, URL section, etc.
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chunks_source_idx").on(table.sourceId),
    index("chunks_notebook_idx").on(table.notebookId),
  ],
);

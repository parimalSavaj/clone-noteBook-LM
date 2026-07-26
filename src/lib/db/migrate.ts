/**
 * Database migration script.
 * Run: npx tsx src/lib/db/migrate.ts
 *
 * This pushes the Drizzle schema to the database and enables pgvector.
 */
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

async function migrate() {
  const sql = postgres(connectionString);

  console.log("Enabling pgvector extension...");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log("Running schema push via drizzle-kit...");
  // drizzle-kit push is used instead of manual SQL for table creation.
  // Run: npx drizzle-kit push
  // This script only handles the extension and the vector column.

  // Add the embedding vector column to chunks if it doesn't exist
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chunks' AND column_name = 'embedding'
      ) THEN
        ALTER TABLE chunks ADD COLUMN embedding vector(1536);
      END IF;
    END $$;
  `;

  // Create HNSW index for fast similarity search
  await sql`
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING hnsw (embedding vector_cosine_ops)
  `;

  // Create GIN index for full-text keyword search (hybrid search)
  console.log("Adding GIN index for full-text search...");
  await sql`
    CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
    ON chunks USING gin(to_tsvector('english', content))
  `;

  console.log("Migration complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

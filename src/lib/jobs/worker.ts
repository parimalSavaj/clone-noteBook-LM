/**
 * BullMQ Worker — Source Indexing Pipeline
 *
 * Run standalone: npx tsx src/lib/jobs/worker.ts
 *
 * This worker processes source indexing jobs:
 * 1. Extract content from the source (type-specific)
 * 2. Chunk the extracted content
 * 3. Generate embeddings via OpenRouter
 * 4. Store chunks + embeddings in the vector DB
 * 5. Update source status to "ready"
 */
import { Worker, Job } from "bullmq";
import { redis } from "./redis";
import type { IndexingJobData } from "./queue";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractText } from "@/lib/ingestion/extractors/text";
import { chunkText } from "@/lib/ingestion/chunking/chunkText";
import { embedTexts } from "@/lib/retrieval/embed";
import postgres from "postgres";

async function processIndexingJob(job: Job<IndexingJobData>) {
  const { sourceId, notebookId, userId, sourceType } = job.data;

  console.log(
    `[Worker] Processing source ${sourceId} (type: ${sourceType}) for notebook ${notebookId}`,
  );

  try {
    // Step 1: Update status to "indexing"
    await db
      .update(sources)
      .set({ status: "indexing", updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    await job.updateProgress(10);

    // Step 2: Fetch the source record
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId));

    if (!source) {
      throw new Error(`Source ${sourceId} not found in database`);
    }
    await job.updateProgress(30);

    // Step 3: Extract content based on source type
    if (sourceType !== "text") {
      throw new Error(
        `Unsupported source type: ${sourceType}. Only "text" is supported in Phase 2.`,
      );
    }

    const extractedContent = await extractText(source.rawContent || "");

    if (!extractedContent) {
      throw new Error(`Source ${sourceId} has no content to process`);
    }
    await job.updateProgress(50);

    // Step 4: Chunk the content
    const chunks = await chunkText(extractedContent);

    if (chunks.length === 0) {
      throw new Error(`Source ${sourceId} produced no chunks after splitting`);
    }

    console.log(`[Worker] Source ${sourceId}: ${chunks.length} chunks created`);
    await job.updateProgress(70);

    // Step 5: Generate embeddings (batched)
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    console.log(
      `[Worker] Source ${sourceId}: ${embeddings.length} embeddings generated`,
    );
    await job.updateProgress(90);

    // Step 6: Store chunks + embeddings in the vector DB
    // Use raw postgres client — the embedding column is vector(1536) added via raw SQL
    // in migrate.ts, so Drizzle doesn't know about it. Insert each row individually
    // rather than via jsonb_to_recordset, which can't reliably cast jsonb arrays to ::vector.
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embeddingStr = `[${embeddings[i].join(",")}]`;

        await sql`
          INSERT INTO chunks (source_id, notebook_id, user_id, content, chunk_index, metadata, embedding)
          VALUES (
            ${sourceId}::uuid,
            ${notebookId}::uuid,
            ${userId},
            ${chunk.content},
            ${chunk.sequenceIndex},
            ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
            ${embeddingStr}::vector
          )
        `;
      }
    } finally {
      await sql.end();
    }

    // Step 7: Update status to "ready"
    await db
      .update(sources)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    await job.updateProgress(100);

    console.log(`[Worker] Source ${sourceId} indexed successfully.`);
  } catch (error) {
    console.error(`[Worker] Failed to index source ${sourceId}:`, error);

    // Mark source as failed so UI reflects the error
    try {
      await db
        .update(sources)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch (dbError) {
      console.error(`[Worker] Failed to set error status:`, dbError);
    }

    throw error; // Let BullMQ handle retries
  }
}

const worker = new Worker<IndexingJobData>(
  "sourceIndexing",
  processIndexingJob,
  {
    connection: redis,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(
    `[Worker] Job ${job.id} completed for source ${job.data.sourceId}`,
  );
});

worker.on("failed", (job, err) => {
  console.error(
    `[Worker] Job ${job?.id} failed for source ${job?.data.sourceId}:`,
    err.message,
  );
});

console.log("[Worker] Source indexing worker started. Waiting for jobs...");

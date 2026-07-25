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

async function processIndexingJob(job: Job<IndexingJobData>) {
  const { sourceId, notebookId, userId, sourceType } = job.data;

  console.log(
    `[Worker] Processing source ${sourceId} (type: ${sourceType}) for notebook ${notebookId}`
  );

  try {
    // Step 1: Update status to "indexing"
    await job.updateProgress(10);
    // TODO: db.update sources set status = 'indexing'

    // Step 2: Extract content based on source type
    await job.updateProgress(30);
    // TODO: call appropriate extractor from src/lib/ingestion/extractors/

    // Step 3: Chunk the content
    await job.updateProgress(50);
    // TODO: call chunking strategy from src/lib/ingestion/chunking/

    // Step 4: Generate embeddings
    await job.updateProgress(70);
    // TODO: call OpenRouter embeddings endpoint

    // Step 5: Store chunks + embeddings in vector DB
    await job.updateProgress(90);
    // TODO: insert into chunks table with embedding vectors

    // Step 6: Update status to "ready"
    await job.updateProgress(100);
    // TODO: db.update sources set status = 'ready'

    console.log(`[Worker] Source ${sourceId} indexed successfully.`);
  } catch (error) {
    console.error(`[Worker] Failed to index source ${sourceId}:`, error);
    // TODO: db.update sources set status = 'error'
    throw error; // Let BullMQ handle retries
  }
}

const worker = new Worker<IndexingJobData>(
  "sourceIndexing",
  processIndexingJob,
  {
    connection: redis,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed for source ${job.data.sourceId}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[Worker] Job ${job?.id} failed for source ${job?.data.sourceId}:`,
    err.message
  );
});

console.log("[Worker] Source indexing worker started. Waiting for jobs...");

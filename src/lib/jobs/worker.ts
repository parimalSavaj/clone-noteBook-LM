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
import { extractWebsite } from "@/lib/ingestion/extractors/website";
import { extractPdfPages } from "@/lib/ingestion/extractors/pdf";
import {
  extractVtt,
  groupCuesIntoWindows,
} from "@/lib/ingestion/extractors/vtt";
import {
  extractYouTube,
  groupSegmentsIntoWindows,
} from "@/lib/ingestion/extractors/youtube";
import { chunkText, chunkSections } from "@/lib/ingestion/chunking/chunkText";
import type { ChunkResult } from "@/lib/ingestion/chunking/chunkText";
import { embedTexts } from "@/lib/retrieval/embed";
import postgres from "postgres";

/**
 * Compute how well a newly indexed source relates to existing sources in the notebook.
 * Uses cosine similarity between the new source's chunk embeddings and existing ones.
 * Averages the top-3 similarities per new chunk to produce a 0-1 relevance score.
 */
async function computeRelevanceScore(
  sourceId: string,
  notebookId: string,
): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Check if there are existing chunks from other sources in this notebook
    const existingCount = await sql`
      SELECT COUNT(*)::int AS count
      FROM chunks
      WHERE notebook_id = ${notebookId}
        AND source_id != ${sourceId}::uuid
    `;

    if (existingCount[0].count === 0) {
      // First source in notebook — leave relevanceScore as null
      console.log(
        `[Worker] Source ${sourceId}: first source in notebook, skipping relevance scoring.`,
      );
      return;
    }

    // Get the new source's embeddings
    const newChunkEmbeddings = await sql`
      SELECT embedding::text AS embedding
      FROM chunks
      WHERE source_id = ${sourceId}::uuid
      LIMIT 20
    `;

    if (newChunkEmbeddings.length === 0) return;

    // For each new chunk, find its top-3 most similar chunks from other sources
    let totalSimilarity = 0;
    let comparisons = 0;

    for (const row of newChunkEmbeddings) {
      const embedding = row.embedding;

      const topMatches = await sql`
        SELECT 1 - (embedding <=> ${embedding}::vector) AS similarity
        FROM chunks
        WHERE notebook_id = ${notebookId}
          AND source_id != ${sourceId}::uuid
        ORDER BY embedding <=> ${embedding}::vector
        LIMIT 3
      `;

      for (const match of topMatches) {
        totalSimilarity += parseFloat(match.similarity);
        comparisons++;
      }
    }

    if (comparisons === 0) return;

    const relevanceScore = totalSimilarity / comparisons;

    // Store on the source row
    await db
      .update(sources)
      .set({ relevanceScore, updatedAt: new Date() })
      .where(eq(sources.id, sourceId));

    console.log(
      `[Worker] Source ${sourceId}: relevance score = ${(relevanceScore * 100).toFixed(1)}%`,
    );
  } catch (error) {
    // Non-fatal — don't fail the whole job for relevance scoring
    console.error(
      `[Worker] Failed to compute relevance score for source ${sourceId}:`,
      error,
    );
  } finally {
    await sql.end();
  }
}

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

    // Step 3: Extract content and chunk based on source type
    let chunks: ChunkResult[];

    switch (sourceType) {
      case "text": {
        const extractedContent = await extractText(source.rawContent || "");
        if (!extractedContent) {
          throw new Error(`Source ${sourceId} has no content to process`);
        }
        chunks = await chunkText(extractedContent);
        break;
      }

      case "website": {
        const url = (source.metadata as Record<string, unknown>)?.url as string;
        if (!url) {
          throw new Error(`Source ${sourceId} is missing metadata.url`);
        }
        const websiteContent = await extractWebsite(url);

        // Store the extracted text as rawContent for future reference
        await db
          .update(sources)
          .set({ rawContent: websiteContent, updatedAt: new Date() })
          .where(eq(sources.id, sourceId));

        chunks = await chunkText(websiteContent);
        break;
      }

      case "pdf": {
        const rawContent = source.rawContent;
        if (!rawContent) {
          throw new Error(`Source ${sourceId} has no PDF content (base64)`);
        }
        const pdfBuffer = Buffer.from(rawContent, "base64");
        const pages = await extractPdfPages(pdfBuffer);

        // Store full text as rawContent (overwrite base64 with extracted text)
        const fullText = pages.map((p) => p.text).join("\n\n");
        await db
          .update(sources)
          .set({ rawContent: fullText, updatedAt: new Date() })
          .where(eq(sources.id, sourceId));

        // Use chunkSections with page metadata
        const sections = pages.map((page) => ({
          text: page.text,
          metadata: { pageNumber: page.pageNumber },
        }));
        chunks = await chunkSections(sections);
        break;
      }

      case "vtt": {
        const vttContent = source.rawContent;
        if (!vttContent) {
          throw new Error(`Source ${sourceId} has no VTT/SRT content`);
        }

        // Determine format from metadata
        const metadata = source.metadata as Record<string, unknown> | null;
        const filename = (metadata?.filename as string) || "";
        const format: "vtt" | "srt" = filename.endsWith(".srt") ? "srt" : "vtt";

        const cues = await extractVtt(vttContent, format);
        if (cues.length === 0) {
          throw new Error(`Source ${sourceId} produced no subtitle cues`);
        }

        // Group cues into time windows and chunk
        const windows = groupCuesIntoWindows(cues);
        chunks = await chunkSections(windows);
        break;
      }

      case "youtube": {
        const metadata = source.metadata as Record<string, unknown> | null;
        const videoUrl = metadata?.videoUrl as string;
        if (!videoUrl) {
          throw new Error(`Source ${sourceId} is missing metadata.videoUrl`);
        }

        const segments = await extractYouTube(videoUrl);

        // Store reconstructed transcript as rawContent
        const transcriptText = segments.map((s) => s.text).join(" ");
        await db
          .update(sources)
          .set({ rawContent: transcriptText, updatedAt: new Date() })
          .where(eq(sources.id, sourceId));

        // Group segments into time windows and chunk
        const windows = groupSegmentsIntoWindows(segments);
        chunks = await chunkSections(windows);
        break;
      }

      default:
        throw new Error(
          `Unsupported source type: ${sourceType}. Supported types: text, website, pdf, vtt, youtube.`,
        );
    }

    if (chunks.length === 0) {
      throw new Error(`Source ${sourceId} produced no chunks after splitting`);
    }

    console.log(`[Worker] Source ${sourceId}: ${chunks.length} chunks created`);
    await job.updateProgress(50);

    // Step 4: Generate embeddings (batched)
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    console.log(
      `[Worker] Source ${sourceId}: ${embeddings.length} embeddings generated`,
    );
    await job.updateProgress(90);

    // Step 5: Store chunks + embeddings in the vector DB
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

    // Step 6: Update status to "ready"
    await db
      .update(sources)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(sources.id, sourceId));

    // Step 7: Compute source relevance score
    // Measures how well this new source relates to existing sources in the notebook
    await computeRelevanceScore(sourceId, notebookId);

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

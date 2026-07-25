import { Queue } from "bullmq";
import { getRedis } from "./redis";

/**
 * Source indexing queue.
 * Jobs represent a source that needs to be extracted, chunked, embedded, and stored.
 */
export interface IndexingJobData {
  sourceId: string;
  notebookId: string;
  userId: string;
  sourceType: string;
}

let _queue: Queue<IndexingJobData> | null = null;

export function getSourceIndexingQueue(): Queue<IndexingJobData> {
  if (!_queue) {
    _queue = new Queue<IndexingJobData>("sourceIndexing", {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });
  }
  return _queue;
}

// Re-export as a named export for use in route handlers
export const sourceIndexingQueue = {
  add: (...args: Parameters<Queue<IndexingJobData>["add"]>) =>
    getSourceIndexingQueue().add(...args),
};

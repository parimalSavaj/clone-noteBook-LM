import { db } from "@/lib/db";
import { sources, chunks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sourceIndexingQueue } from "@/lib/jobs/queue";

const LOCAL_USER_ID = "local";

/**
 * POST /api/sources/[id]/reindex — re-index a source
 *
 * 1. Deletes all existing chunks for the source
 * 2. Resets the source status to "uploading"
 * 3. Enqueues a new indexing job
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Fetch source to verify it exists and get its details
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, id));

  if (!source) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  // 1. Delete all existing chunks for this source
  await db.delete(chunks).where(eq(chunks.sourceId, id));

  // 2. Reset status to "uploading"
  await db
    .update(sources)
    .set({ status: "uploading", updatedAt: new Date() })
    .where(eq(sources.id, id));

  // 3. Enqueue a new indexing job
  await sourceIndexingQueue.add("indexSource", {
    sourceId: id,
    notebookId: source.notebookId,
    userId: LOCAL_USER_ID,
    sourceType: source.type,
  });

  return Response.json({ success: true, message: "Re-indexing started" });
}

import { db } from "@/lib/db";
import { sources, notebooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/sources/[id] — delete a source (cascades to chunks)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Fetch source first to get its notebookId
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, id));

  if (!source) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  // Delete the source (chunks cascade automatically)
  await db.delete(sources).where(eq(sources.id, id));

  // Update parent notebook's updatedAt
  await db
    .update(notebooks)
    .set({ updatedAt: new Date() })
    .where(eq(notebooks.id, source.notebookId));

  return Response.json({ success: true });
}

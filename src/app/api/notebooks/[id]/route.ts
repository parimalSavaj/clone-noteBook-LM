import { db } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/notebooks/[id] — get a single notebook
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.id, id));

  if (!notebook) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json(notebook);
}

/**
 * PATCH /api/notebooks/[id] — rename a notebook
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(notebooks)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(notebooks.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json(updated);
}

/**
 * DELETE /api/notebooks/[id] — delete a notebook (cascades to sources & chunks)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [deleted] = await db
    .delete(notebooks)
    .where(eq(notebooks.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Notebook not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}

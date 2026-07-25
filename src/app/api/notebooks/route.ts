import { db } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Local-only app — single implicit user, no auth required.
const LOCAL_USER_ID = "local";

/**
 * GET /api/notebooks — list all notebooks
 */
export async function GET() {
  const userNotebooks = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.userId, LOCAL_USER_ID))
    .orderBy(notebooks.createdAt);

  return Response.json(userNotebooks);
}

/**
 * POST /api/notebooks — create a new notebook
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const [notebook] = await db
    .insert(notebooks)
    .values({
      userId: LOCAL_USER_ID,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .returning();

  return Response.json(notebook, { status: 201 });
}

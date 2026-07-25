import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/notebooks — list all notebooks for the authenticated user
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userNotebooks = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.userId, userId))
    .orderBy(notebooks.createdAt);

  return Response.json(userNotebooks);
}

/**
 * POST /api/notebooks — create a new notebook
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const [notebook] = await db
    .insert(notebooks)
    .values({
      userId,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .returning();

  return Response.json(notebook, { status: 201 });
}

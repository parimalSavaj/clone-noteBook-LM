import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sourceIndexingQueue } from "@/lib/jobs/queue";
import type { SourceType } from "@/lib/db/schema";

/**
 * GET /api/sources?notebookId=<id> — list all sources for a notebook
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const notebookId = searchParams.get("notebookId");

  if (!notebookId) {
    return Response.json(
      { error: "notebookId is required" },
      { status: 400 }
    );
  }

  const notebookSources = await db
    .select()
    .from(sources)
    .where(
      and(eq(sources.notebookId, notebookId), eq(sources.userId, userId))
    )
    .orderBy(sources.createdAt);

  return Response.json(notebookSources);
}

/**
 * POST /api/sources — upload a new source and queue it for indexing
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { notebookId, name, type, content, metadata: meta } = body;

  if (!notebookId || !name || !type) {
    return Response.json(
      { error: "notebookId, name, and type are required" },
      { status: 400 }
    );
  }

  const validTypes: SourceType[] = ["pdf", "text", "website", "youtube", "vtt"];
  if (!validTypes.includes(type)) {
    return Response.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // Create source record
  const [source] = await db
    .insert(sources)
    .values({
      notebookId,
      userId,
      type,
      name: name.trim(),
      status: "uploading",
      rawContent: content || null,
      metadata: meta || null,
    })
    .returning();

  // Queue the indexing job
  await sourceIndexingQueue.add("indexSource", {
    sourceId: source.id,
    notebookId,
    userId,
    sourceType: type,
  });

  return Response.json(source, { status: 201 });
}

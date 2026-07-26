"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface Notebook {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Source {
  id: string;
  notebookId: string;
  type: string;
  name: string;
  status: "uploading" | "indexing" | "ready" | "error";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Upload form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadType, setUploadType] = useState<
    "text" | "website" | "pdf" | "vtt" | "youtube"
  >("text");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  // Polling ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/sources?notebookId=${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (err) {
      console.error("Failed to fetch sources:", err);
    }
  }, [params.id]);

  // Fetch notebook + sources on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/notebooks/${params.id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setNotebook(data);
        }
        await fetchSources();
      } catch (err) {
        console.error("Failed to fetch notebook:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [params.id, fetchSources]);

  // Poll while any source is still processing
  useEffect(() => {
    const hasProcessing = sources.some(
      (s) => s.status === "uploading" || s.status === "indexing",
    );

    if (hasProcessing && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(fetchSources, 2500);
    } else if (!hasProcessing && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [sources, fetchSources]);

  function resetUploadForm() {
    setUploadName("");
    setUploadContent("");
    setUploadUrl("");
    setUploadFile(null);
    setUploadType("text");
    setShowUploadForm(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);

    try {
      const body: Record<string, unknown> = {
        notebookId: params.id,
        type: uploadType,
      };

      switch (uploadType) {
        case "text": {
          if (!uploadContent.trim()) return;
          body.name = uploadName.trim() || `Text source ${sources.length + 1}`;
          body.content = uploadContent;
          break;
        }
        case "website": {
          if (!uploadUrl.trim()) return;
          body.name = uploadName.trim() || uploadUrl.trim();
          body.metadata = { url: uploadUrl.trim() };
          break;
        }
        case "pdf": {
          if (!uploadFile) return;
          const base64 = await readFileAsBase64(uploadFile);
          body.name = uploadName.trim() || uploadFile.name;
          body.content = base64;
          body.metadata = { filename: uploadFile.name };
          break;
        }
        case "vtt": {
          if (!uploadFile) return;
          const text = await readFileAsText(uploadFile);
          const format = uploadFile.name.endsWith(".srt") ? "srt" : "vtt";
          body.name = uploadName.trim() || uploadFile.name;
          body.content = text;
          body.metadata = { filename: uploadFile.name, format };
          break;
        }
        case "youtube": {
          if (!uploadUrl.trim()) return;
          body.name = uploadName.trim() || `YouTube: ${uploadUrl.trim()}`;
          body.metadata = { videoUrl: uploadUrl.trim() };
          break;
        }
      }

      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const newSource = await res.json();
        setSources((prev) => [...prev, newSource]);
        resetUploadForm();
      }
    } catch (err) {
      console.error("Failed to upload source:", err);
    } finally {
      setUploading(false);
    }
  }

  async function handleReindex(sourceId: string) {
    setReindexingId(sourceId);
    try {
      const res = await fetch(`/api/sources/${sourceId}/reindex`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSources();
      }
    } catch (err) {
      console.error("Failed to reindex source:", err);
    } finally {
      setReindexingId(null);
    }
  }

  async function handleDeleteSource(id: string) {
    const confirmed = window.confirm(
      "Delete this source? All its chunks will be removed.",
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete source:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (notFound || !notebook) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <h2 className="text-2xl font-bold mb-2">Notebook not found</h2>
        <p className="text-zinc-500 mb-6">
          This notebook may have been deleted.
        </p>
        <Link
          href="/notebooks"
          className="text-zinc-900 dark:text-zinc-100 underline hover:no-underline"
        >
          ← Back to notebooks
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/notebooks"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-2 inline-block"
        >
          ← All Notebooks
        </Link>
        <h1 className="text-3xl font-bold">{notebook.name}</h1>
        {notebook.description && (
          <p className="text-zinc-500 mt-1">{notebook.description}</p>
        )}
      </div>

      {/* Sources section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Sources</h2>
          <button
            onClick={() => setShowUploadForm(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            + Add Source
          </button>
        </div>

        {/* Upload form */}
        {showUploadForm && (
          <form
            onSubmit={handleUpload}
            className="mb-4 p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg space-y-3"
          >
            {/* Type selector */}
            <div className="flex gap-1 flex-wrap">
              {(["text", "website", "pdf", "vtt", "youtube"] as const).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setUploadType(t);
                      setUploadContent("");
                      setUploadUrl("");
                      setUploadFile(null);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      uploadType === t
                        ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                        : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {t === "vtt"
                      ? "VTT/SRT"
                      : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ),
              )}
            </div>

            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Source name (optional)"
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />

            {/* Type-specific input */}
            {uploadType === "text" && (
              <textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="Paste your text content here…"
                rows={6}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
              />
            )}

            {uploadType === "website" && (
              <input
                type="url"
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            )}

            {uploadType === "pdf" && (
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-zinc-200 dark:file:bg-zinc-700 file:text-sm file:font-medium"
              />
            )}

            {uploadType === "vtt" && (
              <input
                type="file"
                accept=".vtt,.srt"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-zinc-200 dark:file:bg-zinc-700 file:text-sm file:font-medium"
              />
            )}

            {uploadType === "youtube" && (
              <input
                type="url"
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={
                  uploading ||
                  !isUploadReady(
                    uploadType,
                    uploadContent,
                    uploadUrl,
                    uploadFile,
                  )
                }
                className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <button
                type="button"
                onClick={resetUploadForm}
                className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Sources list */}
        {sources.length === 0 && !showUploadForm ? (
          <div className="border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-8 text-center">
            <p className="text-zinc-500">
              No sources yet. Add one to get started.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="group flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {/* Type badge */}
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase font-medium">
                    {source.type}
                  </span>
                  {/* Name */}
                  <span className="font-medium">{source.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status badge */}
                  <StatusBadge status={source.status} />
                  {/* Reindex button */}
                  <button
                    onClick={() => handleReindex(source.id)}
                    disabled={
                      reindexingId === source.id ||
                      source.status === "uploading" ||
                      source.status === "indexing"
                    }
                    className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                    aria-label={`Re-index ${source.name}`}
                  >
                    Re-index
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteSource(source.id)}
                    className="text-sm text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Delete ${source.name}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Chat section */}
      <ChatSection notebookId={params.id} sources={sources} />
    </div>
  );
}

// --- Helper functions for file uploads ---

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function isUploadReady(
  type: string,
  content: string,
  url: string,
  file: File | null,
): boolean {
  switch (type) {
    case "text":
      return content.trim().length > 0;
    case "website":
    case "youtube":
      return url.trim().length > 0;
    case "pdf":
    case "vtt":
      return file !== null;
    default:
      return false;
  }
}

function StatusBadge({ status }: { status: Source["status"] }) {
  switch (status) {
    case "uploading":
    case "indexing":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {status === "uploading" ? "Uploading" : "Indexing"}
        </span>
      );
    case "ready":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          Ready
        </span>
      );
    case "error":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          Failed
        </span>
      );
    default:
      return null;
  }
}

interface Citation {
  id: string;
  sourceId: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  similarity?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

// --- Citation helpers ---

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildCitationHref(
  citation: Citation,
  sources: Source[],
): string | null {
  const source = sources.find((s) => s.id === citation.sourceId);
  if (!source) return null;

  switch (source.type) {
    case "youtube": {
      const meta = source.metadata as
        | { videoUrl?: string; videoId?: string }
        | undefined;
      const videoId =
        meta?.videoId ||
        (meta?.videoUrl ? extractYouTubeId(meta.videoUrl) : null);
      const startMs = citation.metadata?.startMs as number | undefined;
      if (videoId) {
        const seconds = startMs ? Math.floor(startMs / 1000) : 0;
        return `https://youtube.com/watch?v=${videoId}&t=${seconds}`;
      }
      return null;
    }
    case "website": {
      const meta = source.metadata as { url?: string } | undefined;
      return meta?.url || null;
    }
    case "pdf":
    case "vtt":
    case "text":
    default:
      return null;
  }
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

function buildCitationLabel(
  citation: Citation,
  index: number,
  sources: Source[],
): string {
  const source = sources.find((s) => s.id === citation.sourceId);
  const name = source?.name || "Unknown source";
  const similarityStr =
    citation.similarity != null
      ? ` (${Math.round(citation.similarity * 100)}% match)`
      : "";

  if (!source) return `[${index}] ${name}${similarityStr}`;

  switch (source.type) {
    case "pdf": {
      const page = citation.metadata?.pageNumber as number | undefined;
      return page != null
        ? `[${index}] ${name} — page ${page}${similarityStr}`
        : `[${index}] ${name} — chunk ${citation.chunkIndex}${similarityStr}`;
    }
    case "youtube": {
      const startMs = citation.metadata?.startMs as number | undefined;
      return startMs != null
        ? `[${index}] ${name} — ${formatTimestamp(startMs)}${similarityStr}`
        : `[${index}] ${name}${similarityStr}`;
    }
    case "vtt": {
      const startMs = citation.metadata?.startMs as number | undefined;
      const endMs = citation.metadata?.endMs as number | undefined;
      if (startMs != null && endMs != null) {
        return `[${index}] ${name} — ${formatTimestamp(startMs)} – ${formatTimestamp(endMs)}${similarityStr}`;
      }
      return `[${index}] ${name} — chunk ${citation.chunkIndex}${similarityStr}`;
    }
    case "website":
      return `[${index}] ${name}${similarityStr}`;
    case "text":
    default:
      return `[${index}] ${name} — chunk ${citation.chunkIndex}${similarityStr}`;
  }
}

function ChatSection({
  notebookId,
  sources,
}: {
  notebookId: string;
  sources: Source[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasReadySources = sources.some((s) => s.status === "ready");

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    // 1. Append user message
    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setAsking(true);

    // 2. Append empty assistant placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId, question: trimmed }),
      });

      const contentType = res.headers.get("Content-Type") || "";

      // Non-streaming JSON fallback (no results found)
      if (contentType.includes("application/json")) {
        const data = await res.json();
        const fallbackCitations: Citation[] = (data.citations || []).map(
          (c: Record<string, unknown>) => ({
            ...c,
            metadata:
              typeof c.metadata === "string"
                ? JSON.parse(c.metadata as string)
                : c.metadata || {},
          }),
        );
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: data.answer,
            citations: fallbackCitations,
          };
          return updated;
        });
        setAsking(false);
        return;
      }

      // Read X-Citations header before consuming the stream
      const citationsHeader = res.headers.get("X-Citations");
      let parsedCitations: Citation[] = [];
      if (citationsHeader) {
        try {
          parsedCitations = JSON.parse(citationsHeader).map(
            (c: Record<string, unknown>) => ({
              ...c,
              metadata:
                typeof c.metadata === "string"
                  ? JSON.parse(c.metadata)
                  : c.metadata || {},
            }),
          );
        } catch {
          parsedCitations = [];
        }
      }

      // Stream the response body
      const reader = res.body?.getReader();
      if (!reader) {
        setAsking(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const current = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: current,
          };
          return updated;
        });
      }

      // Pin citations to the assistant message
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          citations: parsedCitations,
        };
        return updated;
      });
    } catch (err) {
      console.error("Query failed:", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Chat</h2>

      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg flex flex-col h-[500px]">
        {/* Message history */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-zinc-400 text-center mt-8">
              Ask a question about your sources.
            </p>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
                      Thinking…
                    </span>
                  )
                ) : (
                  msg.content || (
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
                      Thinking…
                    </span>
                  )
                )}
              </div>

              {/* Per-message citations */}
              {msg.role === "assistant" &&
                msg.citations &&
                msg.citations.length > 0 && (
                  <div className="max-w-[80%] mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                    <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">
                      Citations
                    </p>
                    <ol className="list-none space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {msg.citations.map((citation, citIdx) => {
                        const href = buildCitationHref(citation, sources);
                        const label = buildCitationLabel(
                          citation,
                          citIdx + 1,
                          sources,
                        );

                        return (
                          <li key={citation.id}>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {label}
                              </a>
                            ) : (
                              <span>{label}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-zinc-200 dark:border-zinc-700 p-3 flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              hasReadySources
                ? "Ask a question about your sources…"
                : "Add a source and wait for it to finish indexing…"
            }
            disabled={!hasReadySources || asking}
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!hasReadySources || asking || !question.trim()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {asking ? "…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
  const [uploading, setUploading] = useState(false);

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

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadContent.trim()) return;

    setUploading(true);
    try {
      const name = uploadName.trim() || `Text source ${sources.length + 1}`;
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId: params.id,
          name,
          type: "text",
          content: uploadContent,
        }),
      });
      if (res.ok) {
        const newSource = await res.json();
        setSources((prev) => [...prev, newSource]);
        setUploadName("");
        setUploadContent("");
        setShowUploadForm(false);
      }
    } catch (err) {
      console.error("Failed to upload source:", err);
    } finally {
      setUploading(false);
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
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Source name (optional)"
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <textarea
              value={uploadContent}
              onChange={(e) => setUploadContent(e.target.value)}
              placeholder="Paste your text content here…"
              rows={6}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || !uploadContent.trim()}
                className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUploadForm(false);
                  setUploadName("");
                  setUploadContent("");
                }}
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

      {/* Chat placeholder */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Chat</h2>
        <div className="border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-8 text-center">
          <p className="text-zinc-500">
            Add sources to start asking questions about your documents.
          </p>
        </div>
      </section>
    </div>
  );
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

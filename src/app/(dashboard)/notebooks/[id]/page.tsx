"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Notebook {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchNotebook() {
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
      } catch (err) {
        console.error("Failed to fetch notebook:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchNotebook();
  }, [params.id]);

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

      {/* Sources placeholder */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Sources</h2>
        <div className="border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-8 text-center">
          <p className="text-zinc-500">
            No sources yet. Add one to get started.
          </p>
        </div>
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

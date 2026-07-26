"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Notebook {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  if (diffDays < 7) return `Updated ${diffDays}d ago`;
  return `Updated ${date.toLocaleDateString()}`;
}

export default function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Loading states for rename/delete
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Error states
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotebooks();
  }, []);

  async function fetchNotebooks() {
    try {
      const res = await fetch("/api/notebooks");
      if (res.ok) {
        const data = await res.json();
        setNotebooks(data);
        setFetchError(null);
      } else {
        setFetchError("Couldn't load notebooks.");
      }
    } catch {
      setFetchError("Couldn't load notebooks.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        const notebook = await res.json();
        setNotebooks((prev) => [...prev, notebook]);
        setNewName("");
        setNewDescription("");
        setShowForm(false);
      } else {
        setActionError("Couldn't create notebook. Please try again.");
      }
    } catch {
      setActionError("Couldn't create notebook. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setRenamingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotebooks((prev) => prev.map((n) => (n.id === id ? updated : n)));
      } else {
        setActionError("Couldn't rename notebook. Please try again.");
      }
    } catch {
      setActionError("Couldn't rename notebook. Please try again.");
    } finally {
      setRenamingId(null);
      setEditingId(null);
      setEditName("");
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this notebook? All sources and data will be removed.",
    );
    if (!confirmed) return;
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
      } else {
        setActionError("Couldn't delete notebook. Please try again.");
      }
    } catch {
      setActionError("Couldn't delete notebook. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-500">Loading notebooks…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4 sm:p-8">
        <p className="text-red-600 dark:text-red-400 mb-4">{fetchError}</p>
        <button
          onClick={() => {
            setLoading(true);
            setFetchError(null);
            fetchNotebooks();
          }}
          className="rounded-lg bg-zinc-900 text-white px-4 py-2 font-medium hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Your Notebooks</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-zinc-900 text-white px-4 py-2 font-medium hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New Notebook
        </button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="mb-4 flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">
            {actionError}
          </p>
          <button
            onClick={() => setActionError(null)}
            className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-300 ml-4"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg space-y-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Notebook name"
            autoFocus
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewName("");
                setNewDescription("");
              }}
              className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {notebooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-zinc-500 mb-4">
            Create a notebook to start uploading sources and asking questions.
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              + New Notebook
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {notebooks.map((notebook) => (
            <li
              key={notebook.id}
              className="group flex items-center justify-between p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
            >
              {editingId === notebook.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRename(notebook.id);
                  }}
                  className="flex items-center gap-2 flex-1"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditName("");
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={renamingId === notebook.id}
                    className="text-sm px-2 py-1 bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {renamingId === notebook.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditName("");
                    }}
                    className="text-sm px-2 py-1 text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/notebooks/${notebook.id}`}
                      className="font-medium hover:underline block truncate"
                    >
                      {notebook.name}
                    </Link>
                    <span className="text-xs text-zinc-400">
                      {formatRelativeTime(notebook.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(notebook.id);
                        setEditName(notebook.name);
                      }}
                      className="text-sm px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      aria-label={`Rename ${notebook.name}`}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(notebook.id)}
                      disabled={deletingId === notebook.id}
                      className="text-sm px-2 py-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                      aria-label={`Delete ${notebook.name}`}
                    >
                      {deletingId === notebook.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

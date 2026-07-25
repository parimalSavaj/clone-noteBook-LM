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

export default function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetchNotebooks();
  }, []);

  async function fetchNotebooks() {
    try {
      const res = await fetch("/api/notebooks");
      const data = await res.json();
      setNotebooks(data);
    } catch (err) {
      console.error("Failed to fetch notebooks:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const notebook = await res.json();
        setNotebooks((prev) => [...prev, notebook]);
        setNewName("");
        setShowForm(false);
      }
    } catch (err) {
      console.error("Failed to create notebook:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotebooks((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    } catch (err) {
      console.error("Failed to rename notebook:", err);
    } finally {
      setEditingId(null);
      setEditName("");
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this notebook? All sources and data will be removed.",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete notebook:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-500">Loading notebooks…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Your Notebooks</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-zinc-900 text-white px-4 py-2 font-medium hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New Notebook
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 flex items-center gap-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Notebook name"
            autoFocus
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
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
            }}
            className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
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
                    className="text-sm px-2 py-1 bg-zinc-900 text-white rounded hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save
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
                  <Link
                    href={`/notebooks/${notebook.id}`}
                    className="flex-1 font-medium hover:underline"
                  >
                    {notebook.name}
                  </Link>
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
                      className="text-sm px-2 py-1 text-red-500 hover:text-red-700"
                      aria-label={`Delete ${notebook.name}`}
                    >
                      Delete
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

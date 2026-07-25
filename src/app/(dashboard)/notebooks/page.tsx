"use client";

export default function NotebooksPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-4">Your Notebooks</h1>
      <p className="text-zinc-500 mb-8">
        Create a notebook to start uploading sources and asking questions.
      </p>
      <button className="rounded-lg bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
        + New Notebook
      </button>
    </div>
  );
}

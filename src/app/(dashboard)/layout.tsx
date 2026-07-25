export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold">NotebookLM Clone</h1>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

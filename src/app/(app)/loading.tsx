export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-3 h-3 w-24 rounded bg-surface-3" />
      <div className="mb-8 h-7 w-72 rounded bg-surface-3" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-xl border border-line bg-surface" />
    </div>
  );
}

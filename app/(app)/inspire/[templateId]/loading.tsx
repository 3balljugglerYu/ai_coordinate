export default function InspirePageLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

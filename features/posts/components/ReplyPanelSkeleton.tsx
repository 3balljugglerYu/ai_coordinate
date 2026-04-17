export function ReplyPanelSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse gap-3 border-b border-gray-100 py-3 last:border-b-0"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-200" />
            <div className="h-4 w-2/3 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

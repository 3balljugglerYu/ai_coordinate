export function UserStatsSkeleton() {
  return (
    <div className="mb-6 border-t border-b border-gray-200 py-4">
      <div className="grid grid-cols-4 gap-4 text-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="mb-1 h-6 w-8 animate-pulse rounded bg-gray-200 mx-auto" />
            <div className="h-4 w-12 animate-pulse rounded bg-gray-200 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}


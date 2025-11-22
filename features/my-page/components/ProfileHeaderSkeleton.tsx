export function ProfileHeaderSkeleton() {
  return (
    <div className="mb-6">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 animate-pulse rounded-full bg-gray-200" />
        <div className="min-w-0 flex-1">
          <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}


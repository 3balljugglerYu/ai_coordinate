import { Card } from "@/components/ui/card";

export function ChallengeMissionCardsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="overflow-hidden border-2 p-6">
          <div className="flex items-start justify-between">
            <div className="h-14 w-14 animate-pulse rounded-2xl bg-gray-200" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-gray-200" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            <div className="h-12 animate-pulse rounded-xl bg-gray-200" />
          </div>
        </Card>
      ))}
    </div>
  );
}

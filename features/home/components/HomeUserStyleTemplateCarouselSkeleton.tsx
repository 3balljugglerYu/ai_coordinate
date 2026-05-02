export function HomeUserStyleTemplateCarouselSkeleton() {
  return (
    <section className="mt-6">
      <div className="mb-3 h-6 w-56 animate-pulse rounded bg-muted" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="aspect-square w-[140px] flex-shrink-0 animate-pulse rounded-md bg-muted sm:w-[160px]"
          />
        ))}
      </div>
    </section>
  );
}

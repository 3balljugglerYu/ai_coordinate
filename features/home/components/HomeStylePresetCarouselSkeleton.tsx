const STYLE_PRESET_CARD_WIDTH_PX = 180;
const STYLE_PRESET_CARD_HEIGHT_PX = 284;
const SKELETON_CARD_COUNT = 5;

export function HomeStylePresetCarouselSkeleton() {
  return (
    <div className="mb-8 overflow-x-hidden">
      <div className="mb-3 h-6 w-56 animate-pulse rounded bg-gray-200 sm:ml-0 ml-4" />
      <div className="-mx-4 px-4">
        <div className="flex gap-3">
          {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
            <div
              key={index}
              className="flex-shrink-0 animate-pulse rounded-lg bg-gray-200"
              style={{
                width: STYLE_PRESET_CARD_WIDTH_PX,
                height: STYLE_PRESET_CARD_HEIGHT_PX,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RedPulseDot() {
  return (
    <span className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
    </span>
  );
}

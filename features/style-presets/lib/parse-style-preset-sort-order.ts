export function parseStylePresetSortOrder(
  value: FormDataEntryValue | null,
  fallback = 0
): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
}

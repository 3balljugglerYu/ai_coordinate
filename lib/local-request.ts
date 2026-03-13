const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const IS_LOCAL_DEV_ENV = process.env.NODE_ENV === "development";

function extractHostName(value: string | null): string | null {
  if (!value) return null;

  const firstValue = value.split(",")[0]?.trim().toLowerCase();
  if (!firstValue) return null;

  if (firstValue.startsWith("[")) {
    const bracketEnd = firstValue.indexOf("]");
    if (bracketEnd === -1) return firstValue;
    return firstValue.slice(0, bracketEnd + 1);
  }

  return firstValue.split(":")[0] ?? null;
}

export function isLocalRequest(headers: Pick<Headers, "get">): boolean {
  if (!IS_LOCAL_DEV_ENV) {
    return false;
  }

  const forwardedHost = extractHostName(headers.get("x-forwarded-host"));
  const host = extractHostName(headers.get("host"));
  const candidate = forwardedHost ?? host;

  return candidate !== null && LOCAL_HOSTS.has(candidate);
}

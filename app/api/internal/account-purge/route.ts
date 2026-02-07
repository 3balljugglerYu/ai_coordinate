import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "generated-images";
const STORAGE_REMOVE_CHUNK_SIZE = 100;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildEmailHash(email: string): string {
  const salt = env.ACCOUNT_FORFEITURE_HASH_SALT;
  if (!salt) {
    throw new Error("ACCOUNT_FORFEITURE_HASH_SALT is required");
  }

  return createHash("sha256")
    .update(`${normalizeEmail(email)}|${salt}`, "utf8")
    .digest("hex");
}

function getAvatarStoragePath(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;

  try {
    const url = new URL(avatarUrl);
    const pathname = decodeURIComponent(url.pathname);
    const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/generated-images\/(.+)$/);
    if (!match) {
      return null;
    }

    const path = match[1].split("?")[0];
    return path.startsWith("avatars/") ? path : null;
  } catch {
    return null;
  }
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

async function collectStoragePathsForUser(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string[]> {
  const paths = new Set<string>();

  const [generatedResult, stockResult, profileResult] = await Promise.all([
    admin
      .from("generated_images")
      .select("storage_path, storage_path_display, storage_path_thumb")
      .eq("user_id", userId),
    admin
      .from("source_image_stocks")
      .select("storage_path")
      .eq("user_id", userId),
    admin
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (generatedResult.error) {
    throw new Error(`generated_images query failed: ${generatedResult.error.message}`);
  }
  if (stockResult.error) {
    throw new Error(`source_image_stocks query failed: ${stockResult.error.message}`);
  }
  if (profileResult.error) {
    throw new Error(`profiles query failed: ${profileResult.error.message}`);
  }

  for (const row of generatedResult.data ?? []) {
    if (row.storage_path) paths.add(row.storage_path);
    if (row.storage_path_display) paths.add(row.storage_path_display);
    if (row.storage_path_thumb) paths.add(row.storage_path_thumb);
  }

  for (const row of stockResult.data ?? []) {
    if (row.storage_path) paths.add(row.storage_path);
  }

  const avatarPath = getAvatarStoragePath(profileResult.data?.avatar_url ?? null);
  if (avatarPath) {
    paths.add(avatarPath);
  }

  return [...paths];
}

function parseLimitFromRequest(request: NextRequest, method: "GET" | "POST"): Promise<number> | number {
  if (method === "GET") {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Number(limitParam ?? 100);
    return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  }

  return request
    .json()
    .then((body) => {
      const limit = Number(body?.limit ?? 100);
      return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    })
    .catch(() => 100);
}

async function runPurge(request: NextRequest, method: "GET" | "POST") {
  try {
    const allowedSecrets = [
      env.ACCOUNT_PURGE_CRON_SECRET,
      env.CRON_SECRET,
    ].filter((value): value is string => Boolean(value));

    if (allowedSecrets.length === 0) {
      return NextResponse.json(
        { error: "ACCOUNT_PURGE_CRON_SECRET or CRON_SECRET is not configured" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const isAuthorized = allowedSecrets.some(
      (secret) => authHeader === `Bearer ${secret}`
    );

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedLimit = await parseLimitFromRequest(request, method);

    const admin = createAdminClient();

    const { data: candidates, error: candidatesError } = await admin.rpc(
      "get_due_deletion_candidates",
      { p_limit: normalizedLimit }
    );

    if (candidatesError) {
      console.error("get_due_deletion_candidates error:", candidatesError);
      return NextResponse.json(
        { error: "Failed to fetch deletion candidates" },
        { status: 500 }
      );
    }

    const failures: Array<{ user_id: string; reason: string }> = [];
    let deletedCount = 0;

    for (const candidate of candidates ?? []) {
      const userId = candidate.user_id as string;
      const email = candidate.email as string | null;

      try {
        if (!email) {
          throw new Error("email is missing");
        }

        const paths = await collectStoragePathsForUser(admin, userId);
        if (paths.length > 0) {
          for (const chunk of chunkArray(paths, STORAGE_REMOVE_CHUNK_SIZE)) {
            const { error: storageError } = await admin.storage
              .from(STORAGE_BUCKET)
              .remove(chunk);

            if (storageError) {
              throw new Error(`storage remove failed: ${storageError.message}`);
            }
          }
        }

        const emailHash = buildEmailHash(email);
        const { error: ledgerError } = await admin.rpc("record_forfeiture_ledger", {
          p_user_id: userId,
          p_email_hash: emailHash,
          p_deleted_at: new Date().toISOString(),
        });

        if (ledgerError) {
          throw new Error(`record_forfeiture_ledger failed: ${ledgerError.message}`);
        }

        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) {
          throw new Error(`auth delete failed: ${deleteError.message}`);
        }

        deletedCount += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        console.error("account purge failed", { userId, reason });
        failures.push({ user_id: userId, reason });
      }
    }

    return NextResponse.json({
      success: true,
      processed_count: (candidates ?? []).length,
      deleted_count: deletedCount,
      failed_count: failures.length,
      failures,
    });
  } catch (error) {
    console.error("Account purge route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return runPurge(request, "GET");
}

export async function POST(request: NextRequest) {
  return runPurge(request, "POST");
}

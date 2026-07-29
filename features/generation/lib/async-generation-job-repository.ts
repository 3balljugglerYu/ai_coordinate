import { createAdminClient } from "@/lib/supabase/admin";
import type { ImageJobCreateInput, PromptExecutionInput } from "./job-types";

/**
 * 実行入力を RPC の jsonb 引数へ変換する。
 *
 * 派生ジョブは本文を一切持たない。`source_kind` を 'free' に固定するのは
 * DB 側の CHECK 制約と揃えるためで、ここで値を作らず落とすと制約違反になる。
 */
function toPromptExecutionPayload(
  promptExecution: PromptExecutionInput
): Record<string, unknown> {
  if (promptExecution.kind === "derived_reference") {
    return {
      snapshot_kind: "derived_reference",
      source_kind: "free",
    };
  }

  return {
    snapshot_kind: "materialized",
    provider_prompt: promptExecution.providerPrompt ?? null,
    author_input: promptExecution.authorInput ?? null,
    author_input_owner_id: promptExecution.authorInputOwnerId ?? null,
    source_kind: promptExecution.sourceKind ?? null,
    source_revision: promptExecution.sourceRevision ?? null,
  };
}

type RepositoryResult<T> =
  | { data: T; error: null }
  | { data: null; error: unknown };

type QueueResult = { error: null } | { error: unknown };

export interface AsyncGenerationJobRepository {
  findSourceImageStock(
    sourceImageStockId: string,
    userId: string
  ): Promise<RepositoryResult<{ id: string; image_url: string }>>;
  /**
   * 生成済み画像を入力 source として再利用するときの参照取得。
   * RLS と二重防御のため WHERE user_id を必ず付与する。
   */
  findGeneratedImage(
    generatedImageId: string,
    userId: string
  ): Promise<RepositoryResult<{ id: string; image_url: string }>>;
  uploadSourceImage(
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<RepositoryResult<{ path: string }>>;
  getSourceImagePublicUrl(path: string): string;
  getUserCreditBalance(
    userId: string
  ): Promise<RepositoryResult<{ balance: number }>>;
  getUserSubscriptionPlan(
    userId: string
  ): Promise<RepositoryResult<{ subscription_plan: string | null }>>;
  /**
   * ジョブと生成実行入力を同一トランザクションで作成する。
   *
   * 第2引数は optional にしない。実行入力を持たないジョブは Worker が
   * 生成入力を解決できず処理不能になるため、呼び出し側の注意ではなく
   * 型で渡し忘れを防ぐ（REQ-003c）。
   */
  createImageJob(
    jobData: ImageJobCreateInput,
    promptExecution: PromptExecutionInput
  ): Promise<RepositoryResult<{ id: string; status: string }>>;
  markImageJobFailed(
    jobId: string,
    errorMessage: string
  ): Promise<QueueResult>;
  sendImageJobQueueMessage(jobId: string): Promise<QueueResult>;
}

export class SupabaseAsyncGenerationJobRepository
  implements AsyncGenerationJobRepository
{
  private readonly supabase = createAdminClient();

  async findSourceImageStock(sourceImageStockId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("source_image_stocks")
      .select("id, image_url")
      .eq("id", sourceImageStockId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return { data: null, error: error ?? new Error("stock not found") } as const;
    }

    return { data, error: null } as const;
  }

  async findGeneratedImage(generatedImageId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("generated_images")
      .select("id, image_url")
      .eq("id", generatedImageId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return {
        data: null,
        error: error ?? new Error("generated image not found"),
      } as const;
    }

    return { data, error: null } as const;
  }

  async uploadSourceImage(fileName: string, buffer: Buffer, mimeType: string) {
    const { data, error } = await this.supabase.storage
      .from("generated-images")
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error || !data) {
      return { data: null, error: error ?? new Error("upload failed") } as const;
    }

    return { data: { path: data.path }, error: null } as const;
  }

  getSourceImagePublicUrl(path: string) {
    const {
      data: { publicUrl },
    } = this.supabase.storage.from("generated-images").getPublicUrl(path);

    return publicUrl;
  }

  async getUserCreditBalance(userId: string) {
    const { data, error } = await this.supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return { data: null, error: error ?? new Error("credit not found") } as const;
    }

    return { data, error: null } as const;
  }

  async getUserSubscriptionPlan(userId: string) {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("subscription_plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { data: null, error } as const;
    }

    if (!data) {
      console.warn("User profile not found while resolving subscription plan", {
        userId,
      });
    }

    return {
      data: { subscription_plan: data?.subscription_plan ?? "free" },
      error: null,
    } as const;
  }

  async createImageJob(
    jobData: ImageJobCreateInput,
    promptExecution: PromptExecutionInput
  ) {
    // ジョブと実行入力は原子的に作る。片方だけが残る部分成功を許さないため、
    // 2回の insert ではなく RPC 1本に寄せている。
    // RPC 側で prompt_text は常に空へ正規化されるので、ユーザーが読める列に
    // 本文が残ることはない。
    const { data, error } = await this.supabase
      .rpc("create_image_job_with_prompt_execution", {
        p_job: jobData,
        p_prompt_execution: toPromptExecutionPayload(promptExecution),
      })
      .select("id, status")
      .single();

    if (error || !data) {
      return { data: null, error: error ?? new Error("job create failed") } as const;
    }

    return {
      data: data as { id: string; status: string },
      error: null,
    } as const;
  }

  async markImageJobFailed(jobId: string, errorMessage: string) {
    const { error } = await this.supabase
      .from("image_jobs")
      .update({
        status: "failed",
        processing_stage: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) {
      return { error } as const;
    }

    return { error: null } as const;
  }

  async sendImageJobQueueMessage(jobId: string) {
    const { error } = await this.supabase.rpc("pgmq_send", {
      p_queue_name: "image_jobs",
      p_message: {
        job_id: jobId,
      },
      p_delay: 0,
    });

    if (error) {
      return { error } as const;
    }

    return { error: null } as const;
  }
}

export function createAsyncGenerationJobRepository(): AsyncGenerationJobRepository {
  return new SupabaseAsyncGenerationJobRepository();
}

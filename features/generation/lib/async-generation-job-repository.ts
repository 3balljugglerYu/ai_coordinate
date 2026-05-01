import { createAdminClient } from "@/lib/supabase/admin";
import type { ImageJobCreateInput } from "./job-types";

type RepositoryResult<T> =
  | { data: T; error: null }
  | { data: null; error: unknown };

type QueueResult = { error: null } | { error: unknown };

export interface AsyncGenerationJobRepository {
  findSourceImageStock(
    sourceImageStockId: string,
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
  createImageJob(
    jobData: ImageJobCreateInput
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

  async createImageJob(jobData: ImageJobCreateInput) {
    const { data, error } = await this.supabase
      .from("image_jobs")
      .insert([jobData])
      .select("id, status")
      .single();

    if (error || !data) {
      return { data: null, error: error ?? new Error("job create failed") } as const;
    }

    return { data, error: null } as const;
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

import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { getPromptOverrideByKey } from "@/features/generation-prompts/lib/admin-repository";
import {
  PROMPT_REGISTRY,
  isKnownPromptKey,
  type PromptDefinition,
} from "@/shared/generation/prompt-registry";
import { AdminPromptEditClient } from "@/features/generation-prompts/components/AdminPromptEditClient";

interface PageProps {
  params: Promise<{ key: string }>;
}

export const metadata = {
  title: "プロンプト編集 | Admin",
};

export default async function AdminGenerationPromptEditPage({
  params,
}: PageProps) {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isKnownPromptKey(key)) {
    notFound();
  }

  const def = PROMPT_REGISTRY[key] as PromptDefinition;
  const override = await getPromptOverrideByKey(key);

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2">
          <Link
            href="/admin/generation-prompts"
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            ← 一覧へ戻る
          </Link>
        </div>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          プロンプト編集
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800">
            {key}
          </code>
          <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
            {def.category}
          </span>
        </div>
        <p className="mt-2 text-slate-600">{def.description}</p>
      </header>

      <AdminPromptEditClient
        promptKey={key}
        defaultContent={def.defaultContent}
        // リポジトリ規約: 空文字列も null として扱うため || null を使う
        currentContent={override?.content || null}
        supportedVariables={[...def.supportedVariables]}
        previewSamples={def.previewSamples ?? null}
        updatedAt={override?.updated_at || null}
      />
    </div>
  );
}

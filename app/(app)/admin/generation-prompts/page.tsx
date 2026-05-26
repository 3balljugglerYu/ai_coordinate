import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listAllPromptOverrides } from "@/features/generation-prompts/lib/admin-repository";
import {
  PROMPT_REGISTRY,
  PROMPT_KEYS,
  PROMPT_CATEGORIES,
  type PromptDefinition,
} from "@/shared/generation/prompt-registry";
import { AdminPromptListClient } from "@/features/generation-prompts/components/AdminPromptListClient";

export const metadata = {
  title: "生成プロンプト管理 | Admin",
};

export default async function AdminGenerationPromptsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const overrides = await listAllPromptOverrides();
  const overrideMap = new Map(overrides.map((r) => [r.prompt_key, r]));

  const items = PROMPT_KEYS.map((key) => {
    const def = PROMPT_REGISTRY[key] as PromptDefinition;
    const row = overrideMap.get(key);
    return {
      promptKey: key,
      category: def.category,
      description: def.description,
      hasOverride: row !== undefined,
      // リポジトリ規約: 空文字列も null として扱うため || null を使う
      updatedAt: row?.updated_at || null,
    };
  });

  // registry に無い DB row (孤立)
  const orphans = overrides
    .filter((r) => !(r.prompt_key in PROMPT_REGISTRY))
    .map((r) => ({
      promptKey: r.prompt_key,
      content: r.content,
      updatedAt: r.updated_at,
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          生成プロンプト管理
        </h1>
        <p className="mt-1 text-slate-600">
          Style / Coordinate / Inspire のシステムプロンプトを編集します。
          DB に override が無い項目は コード default が使われます。
        </p>
      </header>
      <AdminPromptListClient
        items={items}
        orphans={orphans}
        categories={PROMPT_CATEGORIES}
      />
    </div>
  );
}

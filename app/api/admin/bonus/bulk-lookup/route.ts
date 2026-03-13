import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_EMAILS = 300;

const bulkLookupSchema = z.object({
  emails: z
    .array(z.string().trim().min(1, "メールアドレスを入力してください"))
    .min(1, "メールアドレスを1件以上入力してください")
    .max(MAX_EMAILS, `メールアドレスは${MAX_EMAILS}件以内で入力してください`),
});

/**
 * メールアドレス配列から user_id と残高を一括取得
 * 一括ペルコイン付与の登録確認用
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = bulkLookupSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const message =
        firstIssue?.path[0] === "emails"
          ? firstIssue.message
          : "入力内容が不正です";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { emails } = parsed.data;
    const uniqueEmails = [...new Set(emails)];

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase.rpc("get_user_ids_by_emails", {
      p_emails: uniqueEmails,
    });

    if (error) {
      console.error("[Admin Bonus Bulk Lookup] RPC error:", error);
      return NextResponse.json(
        { error: "登録確認に失敗しました" },
        { status: 500 }
      );
    }

    const foundEmails = new Set<string>();
    const users = (rows ?? []).map(
      (r: { email: string; user_id: string; balance: number }) => {
        foundEmails.add(r.email);
        return {
          email: r.email,
          user_id: r.user_id,
          balance: r.balance,
        };
      }
    );

    const notFound = uniqueEmails.filter((e) => !foundEmails.has(e));

    return NextResponse.json({
      users,
      not_found: notFound,
    });
  } catch (error: unknown) {
    if (error instanceof NextResponse) {
      return error;
    }
    console.error("[Admin Bonus Bulk Lookup] Exception:", error);
    return NextResponse.json(
      { error: "予期せぬエラーが発生しました" },
      { status: 500 }
    );
  }
}

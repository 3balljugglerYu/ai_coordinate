import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { z } from "zod";

const contactSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  subject: z.string().min(1, "件名を入力してください").max(200),
  message: z.string().min(1, "お問い合わせ内容を入力してください").max(5000),
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const authPromise = supabase.auth.getUser();
    const bodyPromise = request.json();

    const {
      data: { user },
    } = await authPromise;

    if (!user) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    // body と profile 取得を並列化（1.4 Promise.all）
    const [body, profileResult] = await Promise.all([
      bodyPromise,
      supabase
        .from("profiles")
        .select("nickname, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0];
      return NextResponse.json(
        { error: firstError ?? "入力内容に誤りがあります" },
        { status: 400 }
      );
    }

    const { email, subject: rawSubject, message } = parsed.data;
    // CRLFインジェクション対策: メールヘッダーに使用する件名から改行を除去
    const subject = rawSubject.replace(/\r\n|\r|\n/g, " ").trim();
    const { data: profile } = profileResult;

    const formatDate = (d: string | null | undefined) =>
      d ? new Date(d).toLocaleString("ja-JP") : "—";

    const userInfo = {
      userId: user.id,
      email: user.email ?? email,
      nickname: profile?.nickname ?? "—",
      createdAt: formatDate(profile?.created_at ?? user.created_at),
    };

    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        { error: "メール送信の設定が完了していません" },
        { status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);
    const contactEmail = env.CONTACT_EMAIL;

    // Resendの送信元ドメインは検証済みである必要があります
    // onboarding@resend.dev は開発用、本番では RESEND_FROM_EMAIL で独自ドメインを指定
    const fromEmail = env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: contactEmail,
      replyTo: email,
      subject: `[Persta.AI お問い合わせ] ${subject}`,
      html: `
        <h2>お問い合わせがありました</h2>
        <h3>ユーザー情報</h3>
        <ul style="list-style: none; padding: 0;">
          <li><strong>ユーザーID:</strong> ${escapeHtml(userInfo.userId)}</li>
          <li><strong>メールアドレス:</strong> ${escapeHtml(userInfo.email)}</li>
          <li><strong>ニックネーム:</strong> ${escapeHtml(userInfo.nickname)}</li>
          <li><strong>登録日時:</strong> ${escapeHtml(userInfo.createdAt)}</li>
        </ul>
        <p><strong>件名:</strong> ${escapeHtml(subject)}</p>
        <hr />
        <h3>お問い合わせ内容:</h3>
        <pre style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(message)}</pre>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "メールの送信に失敗しました。しばらく経ってからお試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error("Contact API error:", err);
    return NextResponse.json(
      { error: "エラーが発生しました。しばらく経ってからお試しください。" },
      { status: 500 }
    );
  }
}

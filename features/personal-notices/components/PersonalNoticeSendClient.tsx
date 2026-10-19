"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PersonalNoticeDetailScreen } from "@/features/notifications/components/PersonalNoticeDetailScreen";
import type { RecipientLookupRowResponse } from "../lib/api-shared";
import {
  PERSONAL_NOTICE_BODY_MAX,
  PERSONAL_NOTICE_CODE_PLACEHOLDER,
  PERSONAL_NOTICE_CODE_PREFIX_PATTERN,
  PERSONAL_NOTICE_MAX_RECIPIENTS,
  PERSONAL_NOTICE_MEMO_MAX,
  PERSONAL_NOTICE_SAMPLE_CODE_SUFFIX,
  PERSONAL_NOTICE_TITLE_MAX,
  bodyUsesReceiptCode,
  countChars,
} from "../lib/constants";
import { PersonalNoticeListRowPreview } from "./PersonalNoticeListRowPreview";
import { AttachedPostThumb, RecipientIdentity } from "./RecipientCells";

export interface PersonalNoticeSendDefaults {
  memo: string;
  title: string;
  body: string;
  codePrefix: string;
}

interface PersonalNoticeSendClientProps {
  defaults: PersonalNoticeSendDefaults;
  /** 「この文をもとに新しく送る」で来たとき、もとの回のメモ */
  copiedFromMemo: string | null;
}

function validateFields(input: {
  memo: string;
  title: string;
  body: string;
  codePrefix: string;
}) {
  const errors: Partial<Record<"memo" | "title" | "body" | "codePrefix", string>> = {};
  const memo = input.memo.trim();
  const title = input.title.trim();
  if (!memo) errors.memo = "管理用のメモを入力してください";
  else if (countChars(memo) > PERSONAL_NOTICE_MEMO_MAX)
    errors.memo = `${PERSONAL_NOTICE_MEMO_MAX}文字以内で入力してください`;
  if (!title) errors.title = "題名を入力してください";
  else if (countChars(title) > PERSONAL_NOTICE_TITLE_MAX)
    errors.title = `${PERSONAL_NOTICE_TITLE_MAX}文字以内で入力してください`;
  else if (title.includes(PERSONAL_NOTICE_CODE_PLACEHOLDER))
    errors.title = `${PERSONAL_NOTICE_CODE_PLACEHOLDER} は本文にだけ入れられます`;
  if (!input.body.trim()) errors.body = "本文を入力してください";
  else if (countChars(input.body.trim()) > PERSONAL_NOTICE_BODY_MAX)
    errors.body = `${PERSONAL_NOTICE_BODY_MAX}文字以内で入力してください`;
  if (bodyUsesReceiptCode(input.body)) {
    if (!input.codePrefix) {
      errors.codePrefix = `本文に ${PERSONAL_NOTICE_CODE_PLACEHOLDER} があるときは入れてください`;
    } else if (!PERSONAL_NOTICE_CODE_PREFIX_PATTERN.test(input.codePrefix)) {
      errors.codePrefix = "英大文字2〜5文字で入力してください";
    }
  }
  return errors;
}

/**
 * 個人あてのお知らせを送るページ。
 * ① 宛先を貼って確かめる(赤い行があると送れない)→ ② 文を書く → プレビュー → 送る。
 * 計画書 docs/planning/personal-notices-implementation-plan.md Phase 3
 */
export function PersonalNoticeSendClient({
  defaults,
  copiedFromMemo,
}: PersonalNoticeSendClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [recipientsText, setRecipientsText] = useState("");
  const [lookupRows, setLookupRows] = useState<RecipientLookupRowResponse[] | null>(null);
  const [lookedUpText, setLookedUpText] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [memo, setMemo] = useState(defaults.memo);
  const [title, setTitle] = useState(defaults.title);
  const [body, setBody] = useState(defaults.body);
  const [codePrefix, setCodePrefix] = useState(defaults.codePrefix);
  const [showErrors, setShowErrors] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const isLookupCurrent = lookupRows !== null && lookedUpText === recipientsText;
  const errorRowCount = lookupRows?.filter((row) => row.error).length ?? 0;
  const okRows = useMemo(
    () => (lookupRows ?? []).filter((row) => !row.error),
    [lookupRows]
  );
  const withPostCount = okRows.filter((row) => row.kind === "post").length;
  const recipientsReady = isLookupCurrent && okRows.length > 0 && errorRowCount === 0;

  const usesCode = bodyUsesReceiptCode(body);
  const fieldErrors = validateFields({ memo, title, body, codePrefix });
  const fieldsReady = Object.keys(fieldErrors).length === 0;
  const canSend = recipientsReady && fieldsReady && !isSending;

  const sampleCode = `${codePrefix || "XX"}-${PERSONAL_NOTICE_SAMPLE_CODE_SUFFIX}`;
  const previewBody = usesCode
    ? body.split(PERSONAL_NOTICE_CODE_PLACEHOLDER).join(sampleCode)
    : body;
  const previewRecipient = okRows[0] ?? null;

  async function handleLookup() {
    setIsLookingUp(true);
    setLookupError(null);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/personal-notices/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients_text: recipientsText }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLookupRows(null);
        setLookedUpText(null);
        setLookupError(data?.error ?? "宛先の確認に失敗しました");
        return;
      }
      setLookupRows(data.rows);
      setLookedUpText(recipientsText);
    } catch {
      setLookupError("宛先の確認に失敗しました");
    } finally {
      setIsLookingUp(false);
    }
  }

  function insertPlaceholder() {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const next =
      body.slice(0, start) + PERSONAL_NOTICE_CODE_PLACEHOLDER + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      const cursor = start + PERSONAL_NOTICE_CODE_PLACEHOLDER.length;
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  }

  function handleOpenConfirm() {
    setShowErrors(true);
    if (!canSend) return;
    setConfirmOpen(true);
  }

  async function handleSend() {
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/personal-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients_text: recipientsText,
          memo,
          title,
          body,
          code_prefix: usesCode ? codePrefix : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (Array.isArray(data?.rows)) {
          // 確かめたあとで状態が変わった(非公開にした・停止された等)
          setLookupRows(data.rows);
          setLookedUpText(recipientsText);
        }
        const line = typeof data?.line === "number" ? `(${data.line}行目)` : "";
        setSendError(`${data?.error ?? "送れませんでした"}${line}`);
        setConfirmOpen(false);
        return;
      }
      toast({
        title: "送りました",
        description: `${data.recipient_count}人に届けました`,
      });
      router.push(`/admin/personal-notices/${data.notice_id}`);
    } catch {
      setSendError("送れませんでした。送れたかどうかは一覧で確かめてください");
      setConfirmOpen(false);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-8">
      {copiedFromMemo && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          「{copiedFromMemo}」の題名・本文・頭の英字を写しました。宛先は貼り直してください。
        </p>
      )}

      <section className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="pn-recipients">
            ① 宛先 <span className="text-destructive">*</span>
          </Label>
          <p className="text-sm text-slate-600">
            1行に1人。投稿のURLなら投稿した人が宛先になり、その作品がお知らせに付きます。プロフィールのURLかユーザーIDなら文だけで届きます。最大{PERSONAL_NOTICE_MAX_RECIPIENTS}人。
          </p>
        </div>
        <Textarea
          id="pn-recipients"
          rows={6}
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder={"https://www.persta.ai/posts/…\nhttps://www.persta.ai/users/…"}
          className="font-mono text-xs"
          disabled={isSending}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleLookup()}
          pending={isLookingUp}
          disabled={!recipientsText.trim() || isSending}
        >
          {isLookingUp ? null : <Search className="mr-2 h-4 w-4" aria-hidden />}
          宛先を確かめる
        </Button>

        {lookupError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {lookupError}
          </p>
        )}

        {lookupRows && (
          <div className="space-y-3">
            {!isLookupCurrent && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                宛先を変えました。もう一度「宛先を確かめる」を押してください。
              </p>
            )}
            {isLookupCurrent && errorRowCount > 0 && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                送れない行が{errorRowCount}つあります。直すか消してから、もう一度確かめてください。
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium">行</th>
                    <th className="px-4 py-3 text-left font-medium">入力</th>
                    <th className="px-4 py-3 text-left font-medium">宛先</th>
                    <th className="px-4 py-3 text-left font-medium">作品</th>
                    <th className="px-4 py-3 text-left font-medium">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupRows.map((row) => (
                    <tr
                      key={row.line}
                      className={`border-b border-slate-100 last:border-0 ${row.error ? "bg-red-50" : ""}`}
                    >
                      <td className="px-4 py-2">{row.line}</td>
                      <td className="max-w-[10rem] truncate px-4 py-2 font-mono text-xs sm:max-w-[16rem]" title={row.input}>
                        {row.input}
                      </td>
                      <td className="px-4 py-2">
                        {row.recipientId ? (
                          <RecipientIdentity nickname={row.nickname} avatarUrl={row.avatarUrl} />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <AttachedPostThumb
                          postId={row.kind === "post" ? row.postId : null}
                          thumbUrl={row.postThumbUrl}
                        />
                      </td>
                      <td className="min-w-[12rem] px-4 py-2">
                        {row.errorMessage ? (
                          <span className="text-red-600">{row.errorMessage}</span>
                        ) : (
                          "送れます"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <p className="text-sm font-medium text-slate-900">② 文を書く</p>
        {recipientsReady && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            宛先 {okRows.length}人（作品つき {withPostCount}人・文だけ {okRows.length - withPostCount}人）
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="pn-memo">
            管理用のメモ <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pn-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: ハロウィン ベストショット賞"
            disabled={isSending}
            aria-invalid={showErrors && !!fieldErrors.memo}
          />
          <p className="text-sm text-slate-600">
            運営だけが見ます。一覧で探すときに使います。（{PERSONAL_NOTICE_MEMO_MAX}文字まで）
          </p>
          {showErrors && fieldErrors.memo && (
            <p className="text-sm text-destructive">{fieldErrors.memo}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pn-title">
            題名 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pn-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSending}
            aria-invalid={showErrors && !!fieldErrors.title}
          />
          <div className="flex justify-between gap-2">
            {showErrors && fieldErrors.title ? (
              <p className="text-sm text-destructive">{fieldErrors.title}</p>
            ) : (
              <span />
            )}
            <p className="text-sm text-slate-600">
              {countChars(title.trim())}文字 / {PERSONAL_NOTICE_TITLE_MAX}文字
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pn-body">
            本文 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="pn-body"
            ref={bodyRef}
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isSending}
            aria-invalid={showErrors && !!fieldErrors.body}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={insertPlaceholder}
              disabled={isSending}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {PERSONAL_NOTICE_CODE_PLACEHOLDER} を入れる
            </Button>
            <p className="text-sm text-slate-600">
              {countChars(body.trim())}文字 / {PERSONAL_NOTICE_BODY_MAX}文字
            </p>
          </div>
          <p className="text-sm text-slate-600">
            {PERSONAL_NOTICE_CODE_PLACEHOLDER} は1人ずつ違う番号に置き換わります。URLはリンクになります。
          </p>
          {showErrors && fieldErrors.body && (
            <p className="text-sm text-destructive">{fieldErrors.body}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pn-prefix">
            受付番号の頭の英字
            {usesCode && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id="pn-prefix"
            value={codePrefix}
            onChange={(e) => setCodePrefix(e.target.value.toUpperCase().trim())}
            maxLength={5}
            className="w-32 font-mono"
            disabled={isSending || !usesCode}
            aria-invalid={showErrors && !!fieldErrors.codePrefix}
          />
          <p className="text-sm text-slate-600">
            英大文字2〜5文字。番号は「{sampleCode}」のようになります。本文に {PERSONAL_NOTICE_CODE_PLACEHOLDER} があるときだけ使います。賞ごとに変えると、フォームの答えを見分けやすくなります。
          </p>
          {showErrors && fieldErrors.codePrefix && (
            <p className="text-sm text-destructive">{fieldErrors.codePrefix}</p>
          )}
        </div>
      </section>

      {title.trim() && body.trim() && (
        <section className="space-y-3">
          <p className="text-sm font-medium text-slate-900">
            プレビュー
            <span className="ml-2 font-normal text-slate-500">
              {previewRecipient?.nickname
                ? `${previewRecipient.nickname} さんに届く見え方`
                : "届く見え方"}
              {usesCode && "。番号は例です"}
            </span>
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-slate-500">あなたへの通知の1行</p>
              <div className="overflow-hidden rounded-xl border bg-white">
                <PersonalNoticeListRowPreview
                  title={title.trim()}
                  body={previewBody}
                  thumbUrl={previewRecipient?.kind === "post" ? previewRecipient.postThumbUrl : null}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-500">押したときの詳細ページ</p>
              <div className="max-h-[640px] overflow-y-auto rounded-xl border bg-slate-50">
                <PersonalNoticeDetailScreen
                  recordOpened={false}
                  notice={{
                    id: "preview",
                    title: title.trim(),
                    body: previewBody,
                    receivedAtLabel: new Date().toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "Asia/Tokyo",
                    }),
                    post:
                      previewRecipient?.kind === "post" &&
                      previewRecipient.postId &&
                      previewRecipient.postThumbUrl
                        ? { id: previewRecipient.postId, imageUrl: previewRecipient.postThumbUrl }
                        : null,
                    alreadyOpened: false,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/60 p-4">
        <p className="text-sm text-slate-800">
          送ったあとは書き換えできません（1人ずつ取り消すことはできます）。プッシュ通知は出ません。
        </p>
        {!recipientsReady && (
          <p className="text-sm text-slate-600">宛先を確かめて、赤い行がなくなると送れます。</p>
        )}
        {sendError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {sendError}
          </p>
        )}
        <Button
          type="button"
          onClick={handleOpenConfirm}
          disabled={!recipientsReady || isSending}
          pending={isSending}
        >
          {isSending ? null : <Send className="mr-2 h-4 w-4" aria-hidden />}
          {recipientsReady ? `${okRows.length}人に送る` : "送る"}
        </Button>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !isSending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{okRows.length}人に送りますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{title.trim()}」を{okRows.length}人の「あなたへの通知」に届けます。送ったあとは書き換えできません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSending}>やめる</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              disabled={isSending}
            >
              送る
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

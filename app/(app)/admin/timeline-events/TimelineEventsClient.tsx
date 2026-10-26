"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { TimelineEvent } from "@/features/admin-dashboard/lib/timeline-event-repository";
import { toJstDateKey } from "@/features/admin-dashboard/lib/dashboard-range";
import {
  TIMELINE_EVENT_KINDS,
  TIMELINE_EVENT_KIND_LABELS,
  TIMELINE_NOTE_MAX_LENGTH,
  TIMELINE_TITLE_MAX_LENGTH,
  type TimelineEventKind,
  validateTimelineEventInput,
} from "@/features/admin-dashboard/lib/admin-list-validation";

interface FormState {
  eventDate: string;
  kind: TimelineEventKind;
  title: string;
  note: string;
}

function emptyForm(): FormState {
  // 今日(日本時間)。グラフの日付と同じ関数で作る
  return { eventDate: toJstDateKey(new Date()), kind: "campaign", title: "", note: "" };
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900";

export function TimelineEventsClient({
  initialEvents,
}: {
  initialEvents: TimelineEvent[];
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const check = validateTimelineEventInput(form);

  /** 保存のあとに一覧を読み直す。読めなければ、古い一覧のままだと知らせる。 */
  const reload = async () => {
    try {
      const res = await fetch("/api/admin/timeline-events");
      if (!res.ok) throw new Error(String(res.status));
      setEvents((await res.json()) as TimelineEvent[]);
    } catch {
      toast({
        title: "一覧を読み直せませんでした",
        description: "保存はできています。ページを開き直してください",
        variant: "destructive",
      });
    }
  };

  const showError = (error: unknown, fallback: string) => {
    toast({
      title: "エラー",
      description: error instanceof Error ? error.message : fallback,
      variant: "destructive",
    });
  };

  const handleSubmit = async () => {
    if (!check.ok) {
      toast({ title: "入力", description: check.error, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/admin/timeline-events/${editingId}` : "/api/admin/timeline-events",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(check.value),
        },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "保存に失敗しました");
      }
      toast({ title: editingId ? "直しました" : "足しました" });
      setEditingId(null);
      setForm(emptyForm());
      await reload();
    } catch (error) {
      showError(error, "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (event: TimelineEvent) => {
    setEditingId(event.id);
    setForm({
      eventDate: event.eventDate,
      kind: event.kind,
      title: event.title,
      note: event.note ?? "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleDelete = async (event: TimelineEvent) => {
    if (!window.confirm(`「${event.title}」を消しますか?`)) return;
    setBusyId(event.id);
    try {
      const res = await fetch(`/api/admin/timeline-events/${event.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "消せませんでした");
      }
      toast({ title: "消しました" });
      if (editingId === event.id) handleCancelEdit();
      await reload();
    } catch (error) {
      showError(error, "消せませんでした");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          {editingId ? "出来事を直す" : "出来事を足す"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr]">
          <div className="space-y-1">
            <label htmlFor="timeline-date" className="text-sm text-slate-700">
              日付(日本時間)
            </label>
            <Input
              id="timeline-date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="timeline-kind" className="text-sm text-slate-700">
              種類
            </label>
            <select
              id="timeline-kind"
              className={SELECT_CLASS}
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as TimelineEventKind })
              }
            >
              {TIMELINE_EVENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TIMELINE_EVENT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="timeline-title" className="text-sm text-slate-700">
              名前({TIMELINE_TITLE_MAX_LENGTH}文字まで)
            </label>
            <Input
              id="timeline-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例: ハロウィン企画を開始"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="timeline-note" className="text-sm text-slate-700">
            メモ(任意・{TIMELINE_NOTE_MAX_LENGTH}文字まで)
          </label>
          <Textarea
            id="timeline-note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={handleSubmit} pending={saving} disabled={!check.ok}>
            {editingId ? "直す" : "足す"}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={handleCancelEdit}>
              やめる
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          出来事({events.length}件)
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">まだありません。</p>
        ) : (
          <ul className="divide-y rounded-lg border border-slate-200">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm tabular-nums text-slate-500">
                      {event.eventDate}
                    </span>
                    <Badge variant="secondary">
                      {TIMELINE_EVENT_KIND_LABELS[event.kind]}
                    </Badge>
                    <p className="text-sm font-medium text-slate-900">{event.title}</p>
                  </div>
                  {event.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">
                      {event.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(event)}
                  >
                    直す
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(event)}
                    pending={busyId === event.id}
                  >
                    消す
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

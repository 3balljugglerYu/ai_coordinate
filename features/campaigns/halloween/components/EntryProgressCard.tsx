"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  nextTicketTier,
  ticketsForWorks,
  type HashtagCampaignEntryResponse,
  type HashtagCampaignProgressResponse,
} from "@/features/campaigns/hashtag-campaign/progress";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";
import { requestTicketCelebrationCheck } from "../lib/ticket-celebration-requests";
import styles from "../halloween.module.css";

/**
 * つかう人の抽選の「エントリー」と進捗バー(2026-10-15 ユーザー決定。Amazon のキャンペーンページが参考)。
 *
 * - 「エントリーする」を押すと「エントリー済み」になり、バーが出る
 * - バーは10段。ちがう応募作を1つ使って投稿するごとに1段伸びる(3・6・10段で1〜3口)
 * - 抽選はエントリーした人だけ。エントリー前の投稿もさかのぼって数える
 * - 数は DB(get_hashtag_campaign_progress)が数える。作者が応募作を消しても減らず、
 *   自分の投稿を取り消すと減る
 *
 * 本人ごとに違う内容なので、ページ(キャッシュされる)とは別に、開いたあとで読む。
 *
 * 2026-10-15 ユーザー指示: 題名は「キャンペーンに参加」。数え方の吹き出しと「※」の注意書き4つは
 * エントリーしてから出す。エントリー前の「◯作品分たまっています」と、始まる前の「◯から数えます」は出さない。
 */

const PROGRESS_URL = `/api/hashtag-campaigns/${CAMPAIGN.campaignKey}/progress`;
const ENTRY_URL = `/api/hashtag-campaigns/${CAMPAIGN.campaignKey}/entry`;
const LOGIN_HREF = `/login?redirect=${encodeURIComponent(CAMPAIGN.path)}`;

/** バーの段の数 = 最後の口数に届く作品数(10) */
const BAR_STEPS = Math.max(...CAMPAIGN.tickets.map((tier) => tier.works));
const MAX_TICKETS = Math.max(...CAMPAIGN.tickets.map((tier) => tier.tickets));

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: HashtagCampaignProgressResponse };

type EntryState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "failed" }
  | { status: "closed" }
  | { status: "login" };

/** 終わりまでの残り(Amazon と同じく日で。1日を切ったら時間で)。 */
export function formatTimeLeft(ms: number): string {
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (ms >= day) return `${Math.floor(ms / day)}日`;
  if (ms >= hour) return `${Math.floor(ms / hour)}時間`;
  return "1時間未満";
}

function ProgressBar({ works }: { works: number }) {
  const filled = Math.min(works, BAR_STEPS);
  const tickets = ticketsForWorks(works, CAMPAIGN.tickets);
  return (
    <div className={styles.barWrap}>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label={`${CAMPAIGN.prizeCategories.enjoy.name}の抽選の進み具合`}
        aria-valuemin={0}
        aria-valuemax={BAR_STEPS}
        aria-valuenow={filled}
        aria-valuetext={`${BAR_STEPS}作品中${filled}作品(${tickets}口)`}
        data-testid="halloween-entry-bar"
      >
        {Array.from({ length: BAR_STEPS }, (_, index) => (
          <span
            key={index}
            className={styles.barCell}
            data-filled={index < filled ? "true" : "false"}
            data-goal={CAMPAIGN.tickets.some((tier) => tier.works === index + 1) ? "true" : undefined}
          />
        ))}
      </div>
      <div className={styles.barGoals} aria-hidden="true">
        {CAMPAIGN.tickets.map((tier) => (
          <span
            key={tier.tickets}
            className={styles.barGoal}
            style={{ gridColumn: tier.works }}
            data-reached={works >= tier.works ? "true" : "false"}
          >
            🎃{tier.tickets}口
          </span>
        ))}
      </div>
    </div>
  );
}

export function EntryProgressCard({ now = Date.now }: { now?: () => number }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [entry, setEntry] = useState<EntryState>({ status: "idle" });
  /** 押してエントリーできたときの日時(読み直さずに「エントリー済み」へ切り替える) */
  const [enteredAt, setEnteredAt] = useState<string | null>(null);

  /** 「もう一度読み込む」で増やして、読み直しのきっかけにする */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // 状態を書き換えるのは読み終わったあとだけ。閉じたあとに届いた結果は捨てる
    let cancelled = false;
    fetch(PROGRESS_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`progress ${response.status}`);
        return (await response.json()) as HashtagCampaignProgressResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setLoad({ status: "ready", data });
        // 見逃した口数のお祝いは、企画ページを開いたときに出す(ホームはポップアップと重なるので出さない)
        if (data.viewer?.enteredAt) requestTicketCelebrationCheck();
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setLoad({ status: "loading" });
    setReloadKey((key) => key + 1);
  };

  const enter = useCallback(async () => {
    setEntry({ status: "pending" });
    try {
      const response = await fetch(ENTRY_URL, { method: "POST" });
      if (response.ok) {
        const body = (await response.json()) as HashtagCampaignEntryResponse;
        setEnteredAt(body.enteredAt);
        setEntry({ status: "idle" });
        trackCampaignEvent(CAMPAIGN_EVENTS.entryComplete);
        // エントリー前の投稿も数えるので、エントリーしたその場で口数に届いていることがある
        requestTicketCelebrationCheck();
        return;
      }
      if (response.status === 401) {
        setEntry({ status: "login" });
        return;
      }
      setEntry({ status: response.status === 409 ? "closed" : "failed" });
    } catch {
      setEntry({ status: "failed" });
    }
  }, []);

  if (load.status === "loading") {
    return <div className={styles.entrySkeleton} data-testid="halloween-entry-loading" aria-hidden="true" />;
  }

  if (load.status === "error") {
    return (
      <div className={styles.entryCard} data-testid="halloween-entry-card">
        <p className={styles.entryError}>エントリーの状況を読み込めませんでした。</p>
        <div className={styles.entryAction}>
          <button type="button" className={styles.ctaSub} onClick={retry}>
            もう一度読み込む
          </button>
        </div>
      </div>
    );
  }

  const { data } = load;
  const current = now();
  const phase =
    current < Date.parse(data.startsAt) ? "before" : current < Date.parse(data.endsAt) ? "open" : "ended";
  const viewer = data.viewer;
  const works = viewer?.usedWorks ?? 0;
  const tickets = ticketsForWorks(works, CAMPAIGN.tickets);
  const next = nextTicketTier(works, CAMPAIGN.tickets);
  const entered = Boolean(viewer?.enteredAt ?? enteredAt);
  const closed = phase === "ended" || entry.status === "closed";

  return (
    <div className={styles.entryCard} data-testid="halloween-entry-card">
      <div className={styles.entryHead}>
        <span className={styles.entryIcon} aria-hidden="true">
          🎃
        </span>
        <div>
          {entered ? <p className={styles.entryStatus}>✓ エントリー済み</p> : null}
          <h3 className={styles.entryTitle}>キャンペーンに参加</h3>
          {/* 2026-10-16: 全員もらえるように読める「ゲットしよう」をやめた(Amazonギフトカードの注意事項) */}
          <p className={styles.entrySub}>キャンペーン対象作品を利用して、Amazonギフトカードが当たるチャンス！</p>
        </div>
      </div>

      {entered ? (
        <>
          {/*
            幅が狭いと言葉の途中で折り返すので、言葉の切れ目(<wbr />・「、」「・」の後)でだけ折り返す
            (CSS の word-break: keep-all)。「1カウント！」「○作品で○口」はひとまとまり。
          */}
          <p className={styles.entryBubble} data-testid="halloween-entry-bubble">
            対象作品を<wbr />
            生成して<wbr />
            投稿するたびに、<span className={styles.nowrap}>1カウント！</span>
            <br />
            {CAMPAIGN.tickets.map((tier, index) => (
              <Fragment key={tier.tickets}>
                {index > 0 ? "・" : null}
                <span className={styles.nowrap}>
                  {tier.works}作品で{tier.tickets}口
                </span>
              </Fragment>
            ))}
          </p>
          <ProgressBar works={works} />
          <p className={styles.entryNow} data-testid="halloween-entry-now">
            現在 {works}作品({tickets}口)
          </p>
          {next ? (
            <p className={styles.entryNext}>
              あと{next.works - works}作品で{next.tickets}口！
            </p>
          ) : (
            <p className={styles.entryNext}>{MAX_TICKETS}口達成！おめでとうございます🎉</p>
          )}
        </>
      ) : closed ? (
        <p className={styles.entryClosed}>エントリーの受付は終了しました</p>
      ) : viewer === null || entry.status === "login" ? (
        <div className={styles.entryAction}>
          <Link
            className={styles.cta}
            href={LOGIN_HREF}
            onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.entryLogin)}
          >
            ログインしてエントリー
          </Link>
        </div>
      ) : (
        <div className={styles.entryAction}>
          {/*
            処理中は native の disabled にしない(フォーカスが落ちる)。共通の Button の pending と同じく
            aria-disabled + aria-busy にして、押しても何もしない。
          */}
          <button
            type="button"
            className={styles.cta}
            onClick={() => {
              if (entry.status === "pending") return;
              trackCampaignEvent(CAMPAIGN_EVENTS.entryClick);
              void enter();
            }}
            aria-disabled={entry.status === "pending" ? true : undefined}
            aria-busy={entry.status === "pending" ? true : undefined}
          >
            {entry.status === "pending" ? "エントリー中…" : "エントリーする"}
          </button>
          {entry.status === "failed" ? (
            <p className={styles.entryError} role="alert">
              エントリーできませんでした。時間をおいて、もう一度お試しください。
            </p>
          ) : null}
        </div>
      )}

      {/* 始まる前は出さない(10/15 ユーザー指示) */}
      {phase === "before" ? null : (
        <p className={styles.entryTime}>
          {phase === "open"
            ? `企画終了まであと：${formatTimeLeft(Date.parse(data.endsAt) - current)}`
            : "企画は終了しました"}
        </p>
      )}
      {/* 注意書きは「エントリーする」を押したあとに出す(10/15 ユーザー指示) */}
      {entered ? (
        <>
          <p className={styles.note}>※ 1口達成するたびに自動で応募は完了します(投稿を取り消すと、その分の口数は減ります)</p>
          <p className={styles.note}>※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)</p>
          <p className={styles.note}>※ 同じ対象作品で生成してもカウントは増えません</p>
          <p className={styles.note}>※ 期間中に「{CAMPAIGN.hashtag}」のタグを付けて投稿された作品が、対象作品です</p>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { AUTUMN_MOMENT as CAMPAIGN } from "../autumn-moment";
import { useAutumnMomentPhase } from "../hooks/useAutumnMomentPhase";
import styles from "../autumn-moment.module.css";

/**
 * いまの段階のお知らせ(冒頭の期間の下)。応募期間・生成期間・終わったあとで文を変える。
 * 時刻はブラウザで見るので、分かるまでは同じ高さの空きだけ置く(描いたあとにページが動かないように)。
 */
const NOTICE = {
  before: {
    label: "まもなくスタート",
    text: `${CAMPAIGN.submitStartLabel} から応募スタート！`,
    sub: "スタートの前に投稿した作品は、応募作品になりません",
  },
  submit: {
    label: "ただいま応募期間中",
    text: `${CAMPAIGN.submitEndLabel} まで募集中！`,
    sub: "生成・いいね・コメントも、選考の参考にします",
  },
  generate: {
    label: "ただいま生成期間中",
    text: `${CAMPAIGN.generateEndLabel} まで！`,
    sub: "気に入った作品で、うちの子を生成してみよう！",
  },
  closed: {
    label: "生成期間は終わりました",
    text: `結果発表は ${CAMPAIGN.announceLabel} です。お楽しみに！`,
    sub: "たくさんのご参加、ありがとうございました",
  },
} as const;

export function PhaseNotice() {
  const phase = useAutumnMomentPhase();
  if (!phase) {
    return <div className={styles.phaseNotice} data-pending="true" aria-hidden="true" />;
  }
  const notice = NOTICE[phase];
  return (
    <div className={styles.phaseNotice} data-phase={phase} data-testid="autumn-moment-phase-notice">
      <p className={styles.phaseNoticeLabel}>{notice.label}</p>
      <p className={styles.phaseNoticeText}>{notice.text}</p>
      <p className={styles.phaseNoticeSub}>{notice.sub}</p>
    </div>
  );
}

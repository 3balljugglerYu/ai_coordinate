"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { trackCampaignEvent, type CampaignEventName } from "@/features/campaigns/lib/campaign-events";
import { subscribeJoinGuideRequests } from "../lib/join-guide-requests";
import styles from "../halloween.module.css";

export interface JoinTab {
  key: string;
  icon: string;
  /** タブの名前。スマホで2行に分けるため、文字だけでなく要素も渡せる */
  label: ReactNode;
  panel: ReactNode;
  /** このタブに切り替えたときに GA4 に送るイベント(最初に開いているタブは送らない) */
  eventName?: CampaignEventName;
}

/**
 * 参加方法を「クリエイティブ部門」「エンジョイ部門」で切り替えるタブ(2026-10-14。呼び名は 10/15 に賞品の部門へそろえた)。
 * 中身はサーバーで両方描いておき、ここでは見せる方を切り替えるだけ。
 * 対象作品の上のカードの「詳しくはこちら」からも切り替わる(join-guide-requests。タブを押したのではないので GA4 には送らない)。
 */
export function JoinTabs({ tabs }: { tabs: readonly JoinTab[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // tabs は描くたびに新しい配列で渡ってくるので、合図の受け取りは1回だけ付けて、最新の tabs を ref で読む
  const latestTabs = useRef(tabs);
  useEffect(() => {
    latestTabs.current = tabs;
  });
  useEffect(
    () =>
      subscribeJoinGuideRequests((tabKey) => {
        const index = latestTabs.current.findIndex((tab) => tab.key === tabKey);
        if (index >= 0) setActive(index);
      }),
    [],
  );

  const activate = (index: number) => {
    const eventName = tabs[index]?.eventName;
    if (index !== active && eventName) trackCampaignEvent(eventName);
    setActive(index);
  };

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    activate(next);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") select(index + 1);
    else if (event.key === "ArrowLeft") select(index - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div>
      <div role="tablist" aria-label="参加方法" className={styles.tabs}>
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.key}`}
            aria-selected={active === index}
            aria-controls={`${baseId}-panel-${tab.key}`}
            tabIndex={active === index ? 0 : -1}
            className={styles.tab}
            onClick={() => activate(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              {tab.icon}
            </span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${baseId}-panel-${tab.key}`}
          aria-labelledby={`${baseId}-tab-${tab.key}`}
          hidden={active !== index}
          className={styles.tabPanel}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

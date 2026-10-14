"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "../halloween.module.css";

export interface JoinTab {
  key: string;
  icon: string;
  label: string;
  sub: string;
  panel: ReactNode;
}

/**
 * 参加方法を「つくる人」「つかう人」で切り替えるタブ(2026-10-14)。
 * 中身はサーバーで両方描いておき、ここでは見せる方を切り替えるだけ。
 */
export function JoinTabs({ tabs }: { tabs: readonly JoinTab[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
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
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              {tab.icon}
            </span>
            <span className={styles.tabLabel}>{tab.label}</span>
            <span className={styles.tabSub}>{tab.sub}</span>
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

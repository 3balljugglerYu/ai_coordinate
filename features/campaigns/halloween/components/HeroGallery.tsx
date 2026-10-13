import Image from "next/image";
import type { CSSProperties } from "react";
import styles from "../halloween.module.css";

/**
 * 冒頭の作例を5枚並べる(2026-10-13 ユーザー決定)。
 * - スマホ: 右から左へ流しながら、1枚ずつゆらゆら揺らす。触れている間は止める
 * - パソコン: トランプのように扇形に広げて揺らす。マウスを乗せた1枚が前に出る
 * - 動きを減らす設定: 流さず、指で横にスクロールして見る
 * 動きは CSS だけで付ける(JS なし)。流すために同じ並びを2回描き、2回目は読み上げから外す。
 */

const GALLERY = [
  { src: "gallery-pastel.jpg", alt: "パステルカラーの魔女の衣装で、お菓子の国を歩く女の子" },
  { src: "gallery-market.jpg", alt: "オレンジのジャケットで、ハロウィンのお菓子の市場に立つ女の子" },
  { src: "gallery-cat.jpg", alt: "黒猫の耳としっぽを付けて、ランタンの灯る遺跡ではしゃぐ女の子" },
  { src: "gallery-witch.jpg", alt: "魔女の帽子とステッキで、月夜のお城の前を歩く女の子" },
  { src: "gallery-moonlight.jpg", alt: "紫のドレスで、満月の夜の遺跡にたたずむ女の子" },
] as const;

const IMG_DIR = "/campaigns/halloween-best-shot";

export function HeroGallery() {
  return (
    <div className={styles.gallery} aria-label="ペルスタで生成したハロウィンのイラストの例" role="group">
      <ul className={styles.galleryTrack}>
        {[0, 1].map((copy) =>
          GALLERY.map((item, index) => (
            <li
              key={`${copy}-${item.src}`}
              className={styles.galleryCard}
              data-copy={copy === 1 ? "true" : undefined}
              aria-hidden={copy === 1 ? true : undefined}
              data-testid={copy === 0 ? "halloween-gallery-card" : undefined}
              style={{ "--i": index } as CSSProperties}
            >
              <figure className={styles.galleryPhoto}>
                <Image
                  src={`${IMG_DIR}/${item.src}`}
                  alt={copy === 0 ? item.alt : ""}
                  fill
                  priority={copy === 0 && index === 2}
                  sizes="(min-width: 860px) 220px, 78vw"
                  style={{ objectFit: "cover" }}
                />
                <span className={styles.heroPhotoTag}>作例</span>
              </figure>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

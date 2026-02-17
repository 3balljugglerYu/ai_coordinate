/**
 * チュートリアルツアーのステップ定義（Driver.js用）
 * ①はTutorialStartModalで別扱い。②〜⑩がDriver.jsのステップ
 */

import type { DriveStep } from "driver.js";

export const TOUR_STEPS: DriveStep[] = [
  // ② コーディネート画面への誘導
  {
    element: '[data-tour="coordinate-nav"]',
    popover: {
      title: "コーディネート画面へ！",
      description: "ここをタップしてください。",
      side: "top",
      align: "center",
    },
  },
  // ③ 画像アップロード説明
  {
    element: '[data-tour="tour-image-upload"]',
    popover: {
      title: "画像をアップロード！",
      description:
        "ここで着せ替えたい人物画像をアップロードします。<br>今回は体験用の画像をセットしました！",
      side: "bottom",
      align: "start",
    },
  },
  // ④ 着せ替え内容入力の説明
  {
    element: '[data-tour="tour-prompt-input"]',
    popover: {
      title: "着せ替え内容を入力！",
      description:
        "どんなコーデにしたいか入力します。今回は、この内容で進めます！",
      side: "top",
      align: "start",
    },
  },
  // ⑤ 背景変更オプションの説明（自動でチェックを入れる。「次へ」で次へ進む）
  {
    element: '[data-tour="tour-background-change"]',
    popover: {
      title: "背景の変更",
      description:
        "チェックを入れると、コーディネートに合わせて背景が生成されます！<br>今回はチェックを入れて進めてみましょう！",
      side: "right",
      align: "center",
    },
  },
  // ⑧ 生成開始誘導（Next非表示: コーデスタートボタンを押すまで進めない）
  {
    element: '[data-tour="tour-generate-btn"]',
    popover: {
      title: "生成開始！",
      description:
        "「コーデスタート」ボタンを選択して、開始しましょう！<br>※コインが消費されますが、ツアー完了後に戻るのでご安心ください。",
      side: "top",
      align: "center",
      showButtons: ["previous"],
    },
  },
  // ⑨ 生成待機案内（「生成中...」表示欄をハイライト。ボタン非表示）
  {
    element: '[data-tour="tour-generating"]',
    popover: {
      title: "生成しています！",
      description:
        "生成完了まで約20秒ほどかかります。しばらくお待ちください！",
      side: "bottom",
      align: "start",
      showButtons: [],
    },
  },
  // ⑩ 生成完了案内（生成完了時に自動表示。タイトルのみ）
  {
    popover: {
      title: "完了しました！",
      description: "",
      side: "over",
      align: "center",
      showButtons: ["next"],
    },
  },
  // ⑪ 着せ替え完了（クリック不可。「次へ」で進む）
  {
    element: '[data-tour="tour-first-image"]',
    popover: {
      title: "着せ替え完了！",
      description:
        "投稿やダウンロードが可能です！ぜひ試してみてください！",
      side: "top",
      align: "center",
      showButtons: ["next"],
    },
  },
  // ⑭ ツアー完了
  {
    popover: {
      title: "ツアー完了！",
      description:
        "お疲れ様でした！引き続き、着せ替えをお楽しみください！<br>※「完了」をクリックするとコインが付与されます。",
      side: "over",
      align: "center",
      showButtons: ["next"],
    },
  },
];

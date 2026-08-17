# 誰かの Free プロンプトを使ったらペルコイン（利用ミッション）実装計画

## 背景と判断根拠

`/free` のプロンプトを**公開する人**は増えたが、**使う人**が増えていない。

| | 実数（2026-08-18 時点） |
|---|---|
| 公開されている free 投稿 | 46件 |
| うち誰かに使われた | 22件（48%） |
| **使った人** | **7人**（51回・7/30〜8/17） |
| うち自分のプロンプトを自分で使った | 7回 |
| 直近30日に生成した人 | 61人 |

供給はあるのに、使う人が7人しかいない。

### ペルコイン付与は行動を動かしている（実証済み）

生成方法別の投稿ボーナス（PR #515・8/14 稼働）の前後で free 生成が変わった。

| 期間 | free 生成/日 | free 生成UU/日 |
|---|---|---|
| 7/26〜8/13 | 6.1 | 2.2 |
| **8/14〜8/17** | **13.8**（2.3倍） | **6.8**（3.1倍） |

当初「残高が余っているのでペルコインは制約ではない」と見ていたが、**実測がそれを否定した**。
ミッションは通貨としてより**標識として**効いている。

### 経済の前提（数字を残す）

| | |
|---|---|
| 直近30日の付与 | 22,274 pc |
| 直近30日の消費 | 16,736 pc |
| **付与超過** | **+5,538 pc/月** |
| 累計付与 / 消費 | 187,609 / 61,269 pc（消費率 **33%**） |
| 残高合計（潜在負債） | 122,350 pc |
| 有料ペルコイン | 24,870 pc（全付与の **13%**）／最終購入 2026-07-10 |
| 1pc あたり原価 | ¥0.342〜0.635（Low） |

⚠️ **報酬20pc は Low 生成コスト10pc を超える**ため、毎日使うだけで net +10pc が積み上がる
（作者還元2pc も乗るので、2アカウントで使い合えば両方が毎日 +12pc）。
1日1回なので1アカウントあたり原価 ¥3〜6/日、新規登録特典50pc より小さい標的と判断し、
**運営の決定として20pc で進める**。自己利用の除外だけは必須とする。

規模の見立て: 20人が毎日使うと (20+2)×20 = **440 pc/日 ≒ 13,200 pc/月 ≒ ¥4,500〜8,400/月**。

⏰ 投稿ボーナス20/20は**9/6までの期限付き**。9/6 の判断時は投稿ボーナス単体ではなく
**付与全体（streak 8,832 / daily_post 7,784 を含む）を一度に見直す**。

## 仕様（EARS）

- **PU-01** When a derived generation succeeds and its origin post was authored by another user,
  the system shall grant `prompt_use_bonus` percoins to the generating user, once per JST day.
  派生生成が成功し、その原作が他人の投稿であるとき、システムは利用者へ
  `prompt_use_bonus` を JST 日付ごとに1回だけ付与しなければならない。
- **PU-02** If the origin post was authored by the generating user, then the system shall not grant.
  原作が本人の投稿である場合、付与しない（ファーミング防止）。
- **PU-03** While the user has already received the bonus on the same JST day,
  the system shall not grant again.
- **PU-04** If the grant fails, then the system shall still complete the generation.
  付与が失敗しても生成は成功させる（既存の還元と同じ隔離方針）。
- **PU-05** Where the bonus amount is 0 in `percoin_bonus_defaults`,
  the system shall behave as if the mission does not exist（admin から停止できる）。
- **PU-06** When the bonus is granted, the system shall show it in the existing 付与モーダル.

## 設計判断

### ADR-001: 新しい `transaction_type` を作る

- **Context**: 既存コードには「`transaction_type` を増やすと CHECK・admin集計・通知マッピング・
  履歴表示まで波及するため、内訳は metadata で見る」という方針コメントがある。
- **Decision**: それでも `prompt_use_bonus` を新設する。
- **Reason**: `daily_post` に相乗りすると**投稿ボーナスの集計に混ざる**。9/6 に付与全体を
  見直す前提なので、施策ごとに独立して数えられることの価値が波及コストを上回る。
  作者還元 `prompt_usage_reward` に相乗りするのも不可（作者と利用者が混ざる）。
- **Consequence**: CHECK 制約 / `PercoinTransactions.tsx` / admin ラベル / i18n の4箇所を触る。

### ADR-002: 日次判定は専用テーブルの UNIQUE で締める

`daily_post_bonus_grants` と同じ作法。`INSERT ... ON CONFLICT DO NOTHING RETURNING id` が
NULL なら「今日はもう受け取っている」。カウントを読んで判定すると同時実行で二重付与しうる。

### ADR-003: 原作の公開状態は再確認しない

作者還元は原作が `is_posted && visible` であることを確認するが、利用者側では見ない。
**派生生成そのものが原作の利用可否を既に強制している**（非公開・削除済みでは生成できない）ため、
二重チェックになる。加えて、作者の後の操作で利用者の報酬が消えるのは筋が通らない。

### ADR-004: 呼び出しは `record_prompt_usage` の中に置く

作者還元と同じ関数の中で、**独立した例外ブロック**に入れる。
`complete_image_job_with_prompt_secrets` から呼ばれるため、例外を漏らすと
生成全体が失敗＋返金になる。

## フェーズ

### Phase 1: DB
- [ ] `credit_transactions.transaction_type` の CHECK に `prompt_use_bonus` を追加
- [ ] `prompt_use_bonus_grants` テーブル（`UNIQUE (user_id, jst_date)`）
- [ ] `percoin_bonus_defaults` に `prompt_use_daily` = 20 を挿入
- [ ] `grant_prompt_use_daily_bonus(p_event_id uuid) RETURNS integer`（service_role 限定）
- [ ] `record_prompt_usage` から隔離ブロックで呼ぶ

### Phase 2: サーバー / 型
- [ ] `percoin-bonus-defaults.ts` の source 一覧に追加
- [ ] 付与モーダルへ渡す値に利用ボーナスを含める

### Phase 3: UI / i18n
- [ ] 履歴の表示ラベル（ja/en）
- [ ] admin のデフォルト枚数ページのラベル
- [ ] 付与モーダルの一行

### Phase 4: テスト
- [ ] 自己利用では付与しない
- [ ] 同一 JST 日に2回目は付与しない
- [ ] 額0で停止できる

## 測るもの（額ではなく効果）

- ミッション達成者のうち**2回目以降を自腹で使った人の割合**（標識として効いたか）
- 使われたプロンプトの**作者側の継続率**
- **free 投稿の新規作成数**（使われる体験が作り手を増やすか）

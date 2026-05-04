# Supabase Branching を使ったローカル検証 手順

- 最終更新日: `2026-05-04`
- 想定読者: feature ブランチで作った変更を、本番 DB に触れずに **ローカルから preview branch に向けて** 動作確認したい開発者
- 役割: PR 作成で自動生成される Supabase preview branch をローカル `localhost:3000` から利用する手順、Edge Function Secrets の手動コピー、外部トンネル（ngrok / cloudflared）の組み込み、よくあるハマりどころのまとめ

## この手順を使う場面

この runbook は、以下のような **本番 DB に書きたくない短期の動作確認** に使う。

- 新機能のローカル動作確認（例: 投稿フロー、Before/After 表示、新しい RPC など）
- マイグレーションが preview で正しく適用されるかの確認
- worker（Edge Function）からローカル `localhost` に通知を送る経路の確認

短期の subscription renewal だけなら `docs/development/subscription-renewal-branching-runbook.ja.md`、固定 staging で長く回したいなら `docs/development/preview-environment-runbook.ja.md` を使う。

## 前提

- Supabase Branching が有効な plan
- 対象リポジトリで PR 作成 → preview branch 自動作成の連携が動いている
- ngrok もしくは cloudflared が手元で使える（Edge Function → localhost を結ぶときのみ必須）
- 本番 Edge Function Secrets を Dashboard で「Reveal」できる権限がある

## 全体像

```
[ローカル localhost:3000]
   ↑ HTTP（外部公開トンネル経由）
[ngrok / cloudflared]
   ↑
[preview Supabase Edge Function]
   ↑ DB / Storage は preview branch に向く
[preview Supabase DB / Storage]
```

ローカル Next.js は preview Supabase を直接読み書きする。preview Edge Function（worker など）からローカル `localhost` に届ける必要がある場合のみトンネルを挟む。

## Step 1. PR を作って preview branch を待つ

1. feature ブランチを GitHub に push し、main を base に PR を作成する。
2. 数十秒〜数分で preview branch が自動作成される（status が `FUNCTIONS_DEPLOYED` になるまで待つ）。
3. ブランチ情報を確認する。

```bash
# Supabase MCP が使える場合
# list_branches で確認可能。CLI 派は以下:
npx supabase --experimental branches list --project-ref <main の project_ref>
```

確認したい値:

- `project_ref`（例: `sjzofpqpjwsyccrhehpe`）
- `name`（= git ブランチ名）
- `status`（`FUNCTIONS_DEPLOYED` であること）

## Step 2. preview branch の URL と key を取得する

```bash
PREVIEW_REF=<preview の project_ref>

# URL
echo "https://${PREVIEW_REF}.supabase.co"

# anon / publishable key は Dashboard or MCP で取得
# Dashboard: https://supabase.com/dashboard/project/${PREVIEW_REF}/settings/api
```

`SUPABASE_SERVICE_ROLE_KEY` は MCP では取れないので、Dashboard の Project Settings → API → `service_role` を Reveal してコピーする。

> **service_role key は RLS をバイパスする超強権限**。`.env.local` 以外（コミット、Slack、ログ等）に絶対に出さない。

## Step 3. ローカル `.env.local` を preview に向ける

最低限以下の 3 行を preview の値に書き換える。元の本番値は必ずコメントアウトでバックアップしておく。

```env
# 本番（戻すとき用）
# NEXT_PUBLIC_SUPABASE_URL=https://<本番 ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<本番 anon>
# SUPABASE_SERVICE_ROLE_KEY=<本番 service role>

# preview（feature/xxx）
NEXT_PUBLIC_SUPABASE_URL=https://<preview ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<preview anon>
SUPABASE_SERVICE_ROLE_KEY=<preview service role>
```

worker → localhost のループを動かす場合は、後述の `CRON_SECRET` も追記する。

`.env.local` 変更後は **dev server の再起動が必須**。Next.js は起動時にしか env を読まない。

```bash
npm run dev
```

## Step 4. preview の Edge Function Secrets を手動でコピーする

**Supabase Branching は親（main）の Edge Function Secrets を preview に自動コピーしない。** preview で worker を動かすには、必要な secret を手動で set する必要がある。

### 4.1 main 側の secret 一覧を確認

```bash
npx supabase secrets list --project-ref <main の project_ref>
npx supabase secrets list --project-ref <preview の project_ref>
```

差分を見る。よくある不足:

| 変数名 | 用途 | 備考 |
|---|---|---|
| `SERVICE_ROLE_KEY` | worker 内部で Supabase 操作 | **`SUPABASE_` プレフィックスは予約済みで手動 set 不可のため、独自名を使っている** |
| `CRON_SECRET` | worker → 内部 API の認証 Bearer | ローカル `.env.local` と必ず一致させる |
| `OPENAI_API_KEY` | OpenAI 画像生成 | |
| `GEMINI_API_KEY` | Gemini 画像生成 | |
| `SITE_URL` | worker が叩く Next.js のルート URL | 後述のトンネル URL を使う |
| `STYLE_TEMPLATE_CLEANUP_CRON_SECRET` | style template cleanup 用 | 該当機能を確認するときのみ |
| `TEMP_IMAGE_CLEANUP_CRON_SECRET` | temp 画像 cleanup 用 | 該当機能を確認するときのみ |

### 4.2 不足分を set する

⚠️ **`SERVICE_ROLE_KEY` には preview branch の service role key を set する**（main の値を貼らないこと。preview と main は別 DB で別 key）。

```bash
PREVIEW_REF=<preview の project_ref>

# preview branch の service_role key を Dashboard でコピーしてからセット
npx supabase secrets set --project-ref ${PREVIEW_REF} \
  SERVICE_ROLE_KEY=<preview の service_role key>

# 本番側からそのまま流用してよいもの（API キーなど）は Dashboard の Reveal 後コピー
npx supabase secrets set --project-ref ${PREVIEW_REF} \
  OPENAI_API_KEY=<main からコピー> \
  GEMINI_API_KEY=<main からコピー>
```

set 直後の Edge Function 呼び出しは新値が反映されるまで数秒〜十数秒かかることがある。500 が消えるまで少し待つ。

### 4.3 SUPABASE_ プレフィックス系について

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_DB_URL` などの `SUPABASE_` で始まる名前は **Supabase ランタイムが自動注入する予約名** で、手動 set はできない（しなくてよい）。worker 側はこれらをそのまま読める。

ただしリポジトリ側コードが「`SUPABASE_SERVICE_ROLE_KEY` ではなく `SERVICE_ROLE_KEY`」のような独自名で読んでいるケースがあるので、`grep -rn "Deno.env.get" supabase/functions/` で実際に読まれている名前を確認するのが確実。

## Step 5. worker → localhost 経路を作る（必要な場合のみ）

preview Edge Function からローカル `localhost:3000` に通知を送る必要がある機能（例: Before 画像永続化の `persist-before-image`、ensure-webp など）を確認する場合は、トンネルを挟む。

### 5.1 トンネルを起動

#### Cloudflare Tunnel（無認証で最短）

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
# → https://xxxx-xxxx.trycloudflare.com が出る
```

#### ngrok（要アカウント）

```bash
brew install ngrok
# 初回のみ:
#   1. https://dashboard.ngrok.com/signup でアカウント作成
#   2. https://dashboard.ngrok.com/get-started/your-authtoken からトークンをコピー
#   3. ngrok config add-authtoken <token>
ngrok http 3000
# → https://xxxx.ngrok-free.dev が出る
```

> いずれも無料版は起動ごとに URL が変わる。固定が必要なら ngrok 有料プランか Cloudflare Tunnel の named tunnel を検討。

### 5.2 CRON_SECRET を生成して両側にセット

worker → 内部 API の認証で使う。preview 側 と ローカル `.env.local` で **完全に同じ値** にする。

```bash
# 安全な乱数を生成（1Password 等にも保存）
openssl rand -base64 48
```

```bash
# preview branch にセット
npx supabase secrets set --project-ref ${PREVIEW_REF} \
  CRON_SECRET=<上で生成した値>

# トンネル URL を SITE_URL にセット（末尾スラッシュなし）
npx supabase secrets set --project-ref ${PREVIEW_REF} \
  SITE_URL=https://xxxx.trycloudflare.com
```

```env
# .env.local に追記/更新
CRON_SECRET=<上と完全に同じ値>
```

`.env.local` 変更後は dev server を再起動。

> `SITE_URL` は worker が叩く先を決める変数なのでローカル Next.js は使わない。`.env.local` には不要。

## Step 6. 動作確認

1. ブラウザで **`http://localhost:3000`** を直接開く（トンネル URL ではない）。
2. 確認したい機能の主要シナリオを通す。
3. ログを 3 系統で見る。

| 確認元 | 何が見える |
|---|---|
| トンネルのターミナル / Web UI | `POST /api/internal/...` などの worker → localhost のリクエスト |
| dev server のターミナル | Next.js 内部 API のリクエスト処理ログ、`console.error` |
| Supabase Dashboard → preview project → Edge Functions → Logs | worker 自体の `console.log/error` とリクエスト 200/500 |

DB の状態確認は preview project の SQL Editor を直接使うのが速い。

## Step 7. 終了処理

- ローカル: dev server を止め、`.env.local` を本番値に戻す（コメントアウトで残しておいた本番値を有効化）。
- preview branch: PR をマージするか close すれば自動で破棄される。手動破棄は不要。
- トンネル: Ctrl-C で止める。

## トラブルシューティング

| 症状 | 切り分け | 対処 |
|---|---|---|
| Edge Function が `500` で落ちる | Dashboard → Function Logs で `console.error` を見る | 多くは `Missing XXX environment variable`。Step 4 の secret 不足。 |
| worker は動くが内部 API が `401` | dev server のログで `Unauthorized` | `CRON_SECRET` がローカルと preview で不一致。両方を完全一致させ dev 再起動。 |
| トンネルにリクエストが来ない | Function Logs で worker は成功、トンネル UI に到達なし | preview の `SITE_URL` が正しいトンネル URL になっているか `secrets list` で確認。 |
| 楽観表示は出るが永続版に切り替わらない | DB を SQL で見て `pre_generation_storage_path` 等が NULL のまま | worker → 内部 API の経路がどこかで切れている。トンネル UI と Function Logs を時系列で照合。 |
| ローカルの dev サーバーが native crash（`Double free of object`） | Node native module（sharp, heic-convert）の不整合 | `npm rebuild sharp` → 効かなければ `rm -rf node_modules .next && npm install`。 |
| preview に signup できない | preview DB はデータ空 | 想定挙動。新規ユーザーで普通に signup する。 |
| 本番の URL を貼ったら preview branch が表示する | Vercel preview deploy 自動連携が想定通りに動いている | preview deploy で見たいなら PR ページの Vercel コメントの URL を使う。 |

## チェックリスト（コピペ用）

```
[ ] PR を作成して preview branch ができたことを確認
[ ] preview branch の URL / anon / service_role を控えた
[ ] .env.local を preview に書き換えた（本番はコメントアウトで残した）
[ ] dev server を再起動した
[ ] preview の Edge Function Secrets を main と diff した
[ ] SERVICE_ROLE_KEY を preview branch の値で set した
[ ] 必要な API キー（OPENAI / GEMINI 等）を preview に set した
[ ] worker → localhost が必要なら、トンネルを起動して URL を控えた
[ ] CRON_SECRET をローカルと preview で同じ値にセットした
[ ] SITE_URL を preview にセットした
[ ] localhost:3000 を開いて挙動を確認した
[ ] 終了時に .env.local を本番に戻した
```

## 関連ドキュメント

- `docs/development/preview-environment-runbook.ja.md` — 固定 staging project を使う長期検証
- `docs/development/subscription-renewal-branching-runbook.ja.md` — Stripe test clock + Branching での更新日検証
- `docs/development/profiles-migration-gap-checklist.ja.md` — branch 作成時に migration replay が落ちる場合の対処

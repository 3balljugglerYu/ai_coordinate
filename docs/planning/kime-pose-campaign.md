# 11月の企画「うちの子の決めポーズ」

2026-10-30 にユーザーが決めた内容と、結果を出すときの手順。画面の決まりの正本は
`features/campaigns/kime-pose/kime-pose.ts`、応募期間の正本は DB の `hashtag_campaigns`(`kime-pose` の行)。

## 決まったこと

| 項目 | 内容 |
|---|---|
| 応募期間 | 2026-11-01(日) 0:00 〜 11-15(日) 23:59(日本時間) |
| 投票期間 | 2026-11-16(月) 0:00 〜 11-22(日) 23:59 |
| 結果発表 | 投票の締め切りの1週間後(11/29 ごろ) |
| 応募 | CREATE で作った元の作品に `#うちの子の決めポーズ` を付けて投稿(人のプロンプトで作った派生は対象外) |
| 投票 | 応募作品の「このカタログで生成する」から生成すると、1回で1票。投稿しなくてよい。応募期間中の生成も含める |
| 票の数え方 | いつもの利用回数(`prompt_usage_events`)。新しく数える仕組みは作らない。1人が何回生成しても、そのたびに1票 |
| 賞 | ベスト決めポーズ賞 Amazonギフトカード 5,000円分(1名様)・ナイス決めポーズ賞 ペルコイン200枚(10名様) |
| 参加資格 | 18歳以上。Amazonギフトカードは日本国内にお住まいの方だけ。ペルコインは海外の方も可 |
| 投票した人への賞 | なし |

## 結果の出し方(投票の締め切りのあとに1回だけ流す・読み取りのみ)

画面に出ている利用回数(`get_prompt_usage_count`)は期間で区切らず、いまも増え続ける。
結果は、規約(06 選考)のとおり **期間で区切った数** で決めるので、画面の数ではなく下の SQL で出す。

- 数えるのは 11/1 0:00 〜 11/23 0:00 の生成だけ(締め切りのあとの生成と、取り消して投稿し直した作品の期間前の生成を入れない)
- 作者本人の生成と、運営・関係者のアカウント(`analytics_excluded_users`・`admin_users`)の生成は数えない
- 応募作品は、いまも公開中で、いまもハッシュタグが付いているものだけ(企画ページの一覧と同じ条件)
- 同じ回数なら、先に投稿された作品を上にする

```sql
with internal as (
  select user_id from public.analytics_excluded_users
  union
  select user_id from public.admin_users
),
submissions as (
  select gi.id as post_id, gi.user_id as author_id, gi.posted_at
  from public.hashtag_campaigns c
  join public.hashtag_campaign_submissions s on s.campaign_key = c.key
  join public.generated_images gi on gi.id = s.post_id
  where c.key = 'kime-pose'
    and gi.is_posted is true
    and gi.moderation_status = 'visible'
    and exists (
      select 1 from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id
      where ph.post_id = gi.id and h.name_normalized = c.hashtag_normalized
    )
    and gi.user_id not in (select user_id from internal)
),
votes as (
  select e.origin_post_id as post_id, count(*) as votes
  from public.prompt_usage_events e
  where e.origin_post_id in (select post_id from submissions)
    and e.user_id <> e.origin_author_id
    and e.user_id not in (select user_id from internal)
    and e.created_at >= '2026-11-01 00:00:00+09'
    and e.created_at <  '2026-11-23 00:00:00+09'
  group by e.origin_post_id
)
select s.post_id, s.author_id, p.nickname, coalesce(v.votes, 0) as votes, s.posted_at
from submissions s
left join votes v on v.post_id = s.post_id
left join public.profiles p on p.user_id = s.author_id
order by votes desc, s.posted_at asc;
```

2026-10-30 に、同じ形の SQL をハロウィン企画(`halloween-best-shot`・10/16 20:00 〜 11/1 0:00)で流して、動くことを確かめた。

### 上から順に賞を決める(人の手で)

1. 1人で複数の作品が並んだときは、その人のいちばん上の作品だけを残す(賞は1人1つ)
2. Amazonギフトカード: 残った中で、日本国内にお住まいの方のいちばん上の1名。お住まいは DB に無いので、当選のお知らせのフォームで確かめる
3. ペルコイン: Amazonギフトカードの方を除いて、上から10名(海外の方も可)
4. 複数アカウントで回数を増やした疑いがあるものは、規約07 のとおり無効にできる(同じ人の別アカウントからの生成が多い作品は、生成した人の内訳を見て判断する)

## 残っている作業

- 11/1 0:00 より前: マイグレーション `20261030180000_add_kime_pose_hashtag_campaign.sql` を本番に適用・お知らせとバナー
- 画像: 冒頭の作例・X でシェアしたときの画像(OGP)・賞ごとの画像・手順の写真(プロンプト欄と投稿画面)
- 11/16 の投票期間まで: 応募作品のラベル・ホームの棚・みんなのカタログの企画タブ。ハロウィン専用の部品を、企画ごとに切り替えられる共通の部品にまとめる(ハロウィンの部品の写しもここで片付ける)

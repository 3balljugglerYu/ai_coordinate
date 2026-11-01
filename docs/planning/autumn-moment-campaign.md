# 11月の企画「うちの子の秋のひととき」

2026-10-30 にユーザーが決めた内容と、選考の材料を出すときの手順。
2026-10-31 に、テーマを「うちの子の決めポーズ」から「うちの子の秋のひととき」へ変えた。
同じ日に、選考を「利用回数の多い順」から「運営が総合して選ぶ」へ変え、「投票期間」を「生成期間」と呼ぶことにした
(「投票」「票」「いちばん使われた」とは書かない)。画面の決まりの正本は
`features/campaigns/autumn-moment/autumn-moment.ts`、応募期間の正本は DB の `hashtag_campaigns`(`autumn-moment` の行)。

## 決まったこと

| 項目 | 内容 |
|---|---|
| 応募期間 | 2026-11-01(日) 0:00 〜 11-15(日) 23:59(日本時間) |
| 生成期間 | 2026-11-16(月) 0:00 〜 11-22(日) 23:59(応募作品で生成して楽しむ期間) |
| 結果発表 | 生成期間の終わりの1週間後(11/29 ごろ) |
| 応募 | CREATE で作った元の作品に `#うちの子の秋のひととき` を付けて投稿(人のプロンプトで作った派生は対象外) |
| 選考 | ⭐運営が選ぶ。11/1〜11/22 の生成数・いいね・コメントなどを総合して決める(2026-10-31 ユーザー決定)。回数の多い順には決めない |
| 賞 | 秋のひととき大賞 Amazonギフトカード 5,000円分(1名様)・すてきなひととき賞 ペルコイン200枚(10名様)。1人1つまで |
| 参加資格 | 18歳以上。Amazonギフトカードは日本国内にお住まいの方だけ。ペルコインは海外の方も可 |
| 生成した人への賞 | なし |

## 選考の材料の出し方(生成期間の終わりのあとに流す・読み取りのみ)

画面に出ている利用回数(`get_prompt_usage_count`)は期間で区切らず、いまも増え続ける。
選考の材料は、下の SQL で **11/1 0:00 〜 11/23 0:00 に区切って** 出す。この表を見ながら、運営が総合して選ぶ。

- 生成数: 応募作品の「このカタログで生成する」からの生成(`prompt_usage_events`。派生の派生も元の作品に入る)
- いいね・コメント: 期間中に付いたもの(消したコメントは除く)
- どれも、作者本人と、運営・関係者のアカウント(`analytics_excluded_users`・`admin_users`)の分は数えない
- 応募作品は、いまも公開中で、いまもハッシュタグが付いているものだけ(企画ページの一覧と同じ条件)

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
  where c.key = 'autumn-moment'
    and gi.is_posted is true
    and gi.moderation_status = 'visible'
    and exists (
      select 1 from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id
      where ph.post_id = gi.id and h.name_normalized = c.hashtag_normalized
    )
    and gi.user_id not in (select user_id from internal)
),
generations as (
  select e.origin_post_id as post_id, count(*) as generations
  from public.prompt_usage_events e
  join submissions s on s.post_id = e.origin_post_id
  where e.user_id <> s.author_id
    and e.user_id not in (select user_id from internal)
    and e.created_at >= '2026-11-01 00:00:00+09'
    and e.created_at <  '2026-11-23 00:00:00+09'
  group by e.origin_post_id
),
post_likes as (
  select l.image_id as post_id, count(*) as likes
  from public.likes l
  join submissions s on s.post_id = l.image_id
  where l.user_id <> s.author_id
    and l.user_id not in (select user_id from internal)
    and l.created_at >= '2026-11-01 00:00:00+09'
    and l.created_at <  '2026-11-23 00:00:00+09'
  group by l.image_id
),
post_comments as (
  select cm.image_id as post_id, count(*) as comments
  from public.comments cm
  join submissions s on s.post_id = cm.image_id
  where cm.deleted_at is null
    and cm.user_id <> s.author_id
    and cm.user_id not in (select user_id from internal)
    and cm.created_at >= '2026-11-01 00:00:00+09'
    and cm.created_at <  '2026-11-23 00:00:00+09'
  group by cm.image_id
)
select s.post_id, s.author_id, p.nickname,
       coalesce(g.generations, 0) as generations,
       coalesce(l.likes, 0) as likes,
       coalesce(c.comments, 0) as comments,
       s.posted_at
from submissions s
left join generations g on g.post_id = s.post_id
left join post_likes l on l.post_id = s.post_id
left join post_comments c on c.post_id = s.post_id
left join public.profiles p on p.user_id = s.author_id
order by generations desc, likes desc, comments desc, s.posted_at asc;
```

### 賞を決める(運営が選ぶ)

1. 上の表と作品そのものを見て、運営が総合して選ぶ(並び順は見やすさのためだけで、順位ではない)
2. 賞は1人1つ。同じ人の作品が複数あっても、選ぶのは1つ
3. Amazonギフトカード: 日本国内にお住まいの方の作品から1名。お住まいは DB に無いので、当選のお知らせのフォームで確かめる
4. ペルコイン: 10名(海外の方も可)
5. 複数アカウントなどで数を増やした疑いがあるものは、規約07 のとおり無効にできる(生成した人・いいねした人の内訳を見て判断する)

## 残っている作業

- 11/1 0:00 より前: マイグレーション `20261030180000_add_autumn_moment_hashtag_campaign.sql` を本番に適用・お知らせとバナー
- 画像: 冒頭の作例・X でシェアしたときの画像(OGP)・賞ごとの画像・手順の写真(プロンプト欄と投稿画面)
- 11/16 の生成期間まで: 応募作品のラベル・ホームの棚・みんなのカタログの企画タブ。ハロウィン専用の部品を、企画ごとに切り替えられる共通の部品にまとめる(ハロウィンの部品の写しもここで片付ける)

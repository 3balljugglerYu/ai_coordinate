BEGIN;

/*
  サブスクの付与倍率を、購入ページの表示値に合わせる。

  ## 何がずれていたか

  2026-04-11 の `d10b5c6 feat(subscription): update pricing and bonus settings` で
  アプリ側の倍率を下げたが、**DB の関数だけ旧値のまま取り残されていた**。
  同コミットには migration も含まれていたが、この関数は更新されていない。

    プラン      購入ページ(正)  DB(旧)   基本20pc の付与額
    light          1.1          1.2      22 → 実際は 24
    standard       1.3          1.5      26 → 実際は 30
    premium        1.5          2.0      30 → 実際は 40

  ⭐ 購入ページとミッション画面はアプリ側の値(1.1/1.3/1.5)で表示するのに、
  付与は DB の値(1.2/1.5/2.0)で行われていた。**表示と実額のズレ**であり、
  告知より多く配っていた（利用者の不利益ではないが、約束と実装が食い違う）。

  正本は購入ページ。features/subscription/subscription-config.ts の
  bonusMultiplier に合わせる。

  対象は2名(light 1 / premium 1、2026-09-02 時点)。倍率がかかるのは
  grant_daily_post_bonus / grant_prompt_use_daily_bonus / grant_streak_bonus の
  3つで、クリエイター還元は対象外(受け手のプラン特典ではないため)。

  定義は pg_get_functiondef から取得したものを、CASE の3行だけ差し替えている。
*/

CREATE OR REPLACE FUNCTION public.get_subscription_bonus_multiplier(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
begin
  select subscription_plan
  into v_plan
  from public.profiles
  where user_id = p_user_id;

  -- 正本: features/subscription/subscription-config.ts の bonusMultiplier
  return case coalesce(v_plan, 'free')
    when 'light' then 1.1
    when 'standard' then 1.3
    when 'premium' then 1.5
    else 1.0
  end;
end;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

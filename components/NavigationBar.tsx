"use client";

import {
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Home, LayoutGrid, Sparkles, User as UserIcon, Trophy, Bell /* , Coins */ } from "lucide-react";
import { getCurrentUser, onAuthStateChange } from "@/features/auth/lib/auth-client";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { useMissionDots } from "@/features/challenges/components/MissionDotProvider";
import {
  getCoordinateSourceStockSavePromptDot,
  subscribeCoordinateSourceStockSavePromptDot,
} from "@/features/generation/lib/coordinate-source-stock-save-prompt-state";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
  stripLocalePrefix,
} from "@/i18n/config";
import { requiresAuthForGuestNavigation } from "@/lib/navigation-auth";
import { handleNavigationRetap } from "@/lib/nav-retap";
import {
  CATALOG_ENTRY_PATH,
  GENERATION_ENTRY_PATH,
  isNavItemActive,
  resolveGenerationEntryPath,
} from "@/lib/nav-entries";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const navT = useTranslations("nav");
  // カタログ刷新(段階公開中は運営のみ)では「カタログ」を足し、生成の入口を「つくる」にする
  const isCatalogRevamp = useStylesCatalogRevamp();
  const [user, setUser] = useState<User | null>(null);
  // トランジション状態: ナビゲーションを非ブロッキングにする
  const [, startTransition] = useTransition();
  // プリフェッチ実行フラグ: 1回のみ実行するため
  const hasPrefetched = useRef(false);
  const pendingResetTimeoutRef = useRef<number | null>(null);
  const pendingSourcePathRef = useRef<string | null>(null);
  const { hasSidebarDot, markAnnouncementPageSeen } = useUnreadNotificationCount();
  const { hasMissionTabDot, markMissionTabSnoozed } = useMissionDots();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const [
    hasCoordinateSourceStockSavePromptDot,
    setHasCoordinateSourceStockSavePromptDot,
  ] = useState(getCoordinateSourceStockSavePromptDot);
  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  const localizedHomePath = localizePublicPath("/", locale);
  const effectiveActivePathname = pendingPathname ?? normalizedPathname;

  const clearPendingNavigationFromEffect = useEffectEvent(() => {
    if (pendingResetTimeoutRef.current) {
      clearTimeout(pendingResetTimeoutRef.current);
      pendingResetTimeoutRef.current = null;
    }

    pendingSourcePathRef.current = null;
    setPendingPathname(null);
  });

  useEffect(() => {
    // 初回ロード時のユーザー取得
    getCurrentUser().then((user) => {
      setUser(user);
    });

    // 認証状態の変更を監視
    const subscription = onAuthStateChange((user) => {
      setUser(user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 認証済みユーザーに対して主要ページをプリフェッチ（他画面から戻った際の即表示用）
  useEffect(() => {
    if (user && !hasPrefetched.current) {
      router.prefetch(localizedHomePath);
      router.prefetch(localizePublicPath("/coordinate", locale));
      router.prefetch(localizePublicPath("/style", locale));
      router.prefetch("/challenge");
      router.prefetch("/notifications");
      router.prefetch("/my-page");
      hasPrefetched.current = true;
    }
  }, [localizedHomePath, locale, user, router]);

  // 刷新後に増える行き先(カタログと Free Style)も先読みする。
  // 運営の判定はマウント後に確定するので、上の1回きりの先読みとは分けて見る。
  useEffect(() => {
    if (user && isCatalogRevamp) {
      router.prefetch(localizePublicPath(CATALOG_ENTRY_PATH, locale));
      router.prefetch(localizePublicPath("/free", locale));
    }
  }, [isCatalogRevamp, locale, user, router]);

  useEffect(() => {
    if (!pendingPathname) {
      return;
    }

    // 目的地に到達した時点で pending を解除する。
    // 「出発地から離れた時点で解除」だと、中間遷移（例: ログインリダイレクト）
    // で誤発火し、まだ到達していないのに pending が外れて元タブが活性表示される
    // フリッカが起きるため、到達判定で揃える。
    if (normalizedPathname === pendingPathname) {
      clearPendingNavigationFromEffect();
    }
  }, [normalizedPathname, pendingPathname]);

  useEffect(() => {
    return () => {
      if (pendingResetTimeoutRef.current) {
        clearTimeout(pendingResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeCoordinateSourceStockSavePromptDot(
      setHasCoordinateSourceStockSavePromptDot
    );
  }, []);

  const handleNavigation = (path: string) => {
    let normalizedTargetPath = stripLocalePrefix(path).pathname;
    let resolvedPath = path;

    // 生成の入口は押したときに行き先を決める。刷新前(コーディネート)は前回使った
    // 生成モードへ、刷新後(つくる)は毎回 Free Style へ。チュートリアルツアー中は
    // ツアーの目的地(/style)へ固定する(詳細は lib/nav-entries.ts)。
    if (normalizedTargetPath === GENERATION_ENTRY_PATH) {
      const preferred = resolveGenerationEntryPath(isCatalogRevamp);
      if (preferred !== GENERATION_ENTRY_PATH) {
        // path 内の "/coordinate" のみ差し替え、ロケールプレフィックスや
        // クエリ・ハッシュ等の付随情報を維持する。
        resolvedPath = path.replace(GENERATION_ENTRY_PATH, preferred);
        normalizedTargetPath = preferred;
      }
    }

    if (
      normalizedTargetPath === "/challenge" &&
      normalizedPathname === normalizedTargetPath
    ) {
      markMissionTabSnoozed();
    }

    // 既にそのタブにいるときの再タップ(ホームなら一番上へ戻す)
    if (
      normalizedPathname === normalizedTargetPath &&
      handleNavigationRetap(normalizedTargetPath)
    ) {
      return;
    }

    if (pendingPathname || normalizedPathname === normalizedTargetPath) {
      return;
    }

    // 公開パス(/coordinate, /style 等)はロケール付き URL へ直接遷移し、
    // proxy の 307 リダイレクトを介さない(1 ホップ分速くする)。
    let destinationPath = localizePublicPath(resolvedPath, locale);
    let pendingTargetPath = normalizedTargetPath;

    if (requiresAuthForGuestNavigation(normalizedTargetPath) && !user) {
      destinationPath = `/login?redirect=/`;
      pendingTargetPath = "/login";
    }

    pendingSourcePathRef.current = normalizedPathname;
    setPendingPathname(pendingTargetPath);
    if (pendingResetTimeoutRef.current) {
      clearTimeout(pendingResetTimeoutRef.current);
    }
    // 安全網タイムアウト: 通常は到達判定で解除されるが、ナビゲーションが
    // 想定外に失敗・遅延した場合の保険として残す。重い画面の初回遷移でも
    // フリッカしないよう、当初 2 秒だった値を 10 秒に延長している。
    pendingResetTimeoutRef.current = window.setTimeout(() => {
      pendingResetTimeoutRef.current = null;
      pendingSourcePathRef.current = null;
      setPendingPathname(null);
    }, 10000);

    // startTransitionでナビゲーションを非ブロッキングにする
    startTransition(() => {
      if (normalizedTargetPath === "/notifications") {
        void markAnnouncementPageSeen();
      }
      if (normalizedTargetPath === "/challenge") {
        markMissionTabSnoozed();
      }

      router.push(destinationPath);
    });
  };

  const navItems = [
    { path: localizedHomePath, label: navT("home"), icon: Home },
    ...(isCatalogRevamp
      ? [{ path: CATALOG_ENTRY_PATH, label: navT("catalog"), icon: LayoutGrid }]
      : []),
    {
      path: GENERATION_ENTRY_PATH,
      label: isCatalogRevamp ? navT("create") : navT("coordinate"),
      icon: Sparkles,
    },
    { path: "/challenge", label: navT("challenge"), icon: Trophy },
    { path: "/notifications", label: navT("notifications"), icon: Bell },
    { path: "/my-page", label: navT("myPage"), icon: UserIcon },
    // { path: "/my-page/credits", label: "ペルコイン", icon: Coins },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-sm shadow-lg lg:hidden safe-area-inset-bottom">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2">
          {/* ナビゲーションアイテム */}
          <div className="flex flex-1 items-center justify-around">
            {navItems.map(({ path, label, icon: Icon }) => {
              const normalizedItemPath = stripLocalePrefix(path).pathname;
              // 生成の入口は生成モード全体の入口、カタログは /user-styles も含めて
              // アクティブ表示する(lib/nav-entries.ts)。
              const isActive = isNavItemActive(
                normalizedItemPath,
                effectiveActivePathname,
                isCatalogRevamp
              );
              return (
                <button
                  key={path}
                  data-tour={path === GENERATION_ENTRY_PATH ? "coordinate-nav-mobile" : undefined}
                  onClick={() => handleNavigation(path)}
                  disabled={pendingPathname !== null}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-all duration-200 ease-out",
                    // 刷新後は6項目になる。1項目60px のままだと幅の狭いスマホ(iPhone SE など)で
                    // 収まらないので、最小幅をやめて左右の余白を詰め、長いラベルは省略する
                    isCatalogRevamp ? "min-w-0 px-1" : "min-w-[60px] px-2",
                    "active:scale-80 active:opacity-80 disabled:cursor-wait",
                    "md:flex-row md:gap-2 md:text-sm",
                    pendingPathname !== null && !isActive && "opacity-60",
                    isActive
                      ? "text-primary"
                      : "text-gray-400"
                  )}
                >
                  {/* アクティブインジケーター（上部のバー） */}
                  <span 
                    className={cn(
                      "absolute top-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-200 ease-out",
                      isActive ? "opacity-100 w-8 nav-indicator-expand" : "opacity-0 w-0"
                    )}
                  />
                  {/* アイコン */}
                  <div className="relative">
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-all duration-200",
                        isActive ? "scale-110" : "scale-100"
                      )}
                    />
                    {path === "/notifications" && hasSidebarDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                    )}
                    {path === GENERATION_ENTRY_PATH &&
                      hasCoordinateSourceStockSavePromptDot && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                      )}
                    {path === "/challenge" && hasMissionTabDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                    )}
                  </div>
                  {/* ラベル */}
                  <span
                    className={cn(
                      "transition-all duration-200",
                      isCatalogRevamp && "max-w-full truncate"
                    )}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

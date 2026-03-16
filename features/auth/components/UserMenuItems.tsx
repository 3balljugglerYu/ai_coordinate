"use client";

import Link from "next/link";
import { User as UserIcon, UserCircle, MessageCircle, Coins, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LanguageSettingsMenu } from "@/components/LanguageSettingsMenu";
import { ROUTES } from "@/constants";

interface UserMenuItemsProps {
  /** マイページへのリンクを表示する（ヘッダー用） */
  includeMyPage?: boolean;
  /** 言語設定を含める */
  includeLanguageSettings?: boolean;
  /** ログアウト時のコールバック */
  onSignOut: () => void;
}

/**
 * ユーザーメニューの共通項目（アカウント、お問い合わせ、ペルコイン購入、ログアウト）
 * ProfileHeader と StickyHeader で共有
 */
export function UserMenuItems({
  includeMyPage = false,
  includeLanguageSettings = true,
  onSignOut,
}: UserMenuItemsProps) {
  const navT = useTranslations("nav");
  const linkClassName = "flex items-center cursor-pointer";

  return (
    <>
      {includeMyPage ? (
        <DropdownMenuItem asChild>
          <Link href={ROUTES.MY_PAGE} className={linkClassName}>
            <UserIcon className="mr-2 h-4 w-4" />
            {navT("myPage")}
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_ACCOUNT} className={linkClassName}>
          <UserCircle className="mr-2 h-4 w-4" />
          {navT("account")}
        </Link>
      </DropdownMenuItem>
      {includeLanguageSettings ? (
        <LanguageSettingsMenu variant="dropdown" />
      ) : null}
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_CONTACT} className={linkClassName}>
          <MessageCircle className="mr-2 h-4 w-4" />
          {navT("contact")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_CREDITS_PURCHASE} className={linkClassName}>
          <Coins className="mr-2 h-4 w-4" />
          {navT("creditsPurchase")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onSignOut}
        className="text-destructive cursor-pointer"
      >
        <LogOut className="mr-2 h-4 w-4" />
        {navT("logout")}
      </DropdownMenuItem>
    </>
  );
}

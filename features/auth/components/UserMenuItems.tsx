"use client";

import Link from "next/link";
import { User as UserIcon, UserCircle, MessageCircle, Coins, LogOut } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/constants";

interface UserMenuItemsProps {
  /** マイページへのリンクを表示する（ヘッダー用） */
  includeMyPage?: boolean;
  /** ログアウト時のコールバック */
  onSignOut: () => void;
}

/**
 * ユーザーメニューの共通項目（アカウント、お問い合わせ、ペルコイン購入、ログアウト）
 * ProfileHeader と StickyHeader で共有
 */
export function UserMenuItems({
  includeMyPage = false,
  onSignOut,
}: UserMenuItemsProps) {
  const linkClassName = "flex items-center cursor-pointer";

  return (
    <>
      {includeMyPage ? (
        <DropdownMenuItem asChild>
          <Link href={ROUTES.MY_PAGE} className={linkClassName}>
            <UserIcon className="mr-2 h-4 w-4" />
            マイページ
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_ACCOUNT} className={linkClassName}>
          <UserCircle className="mr-2 h-4 w-4" />
          アカウント
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_CONTACT} className={linkClassName}>
          <MessageCircle className="mr-2 h-4 w-4" />
          お問い合わせ
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={ROUTES.MY_PAGE_CREDITS_PURCHASE} className={linkClassName}>
          <Coins className="mr-2 h-4 w-4" />
          ペルコイン購入
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onSignOut}
        className="text-destructive cursor-pointer"
      >
        <LogOut className="mr-2 h-4 w-4" />
        ログアウト
      </DropdownMenuItem>
    </>
  );
}
